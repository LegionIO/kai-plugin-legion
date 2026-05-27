/**
 * Daemon inference provider for the Kai plugin API.
 *
 * Streams LLM inference through the Legion daemon's /api/llm/inference
 * endpoint. When LegionIO is the selected runtime this provider owns the
 * request; daemon failures are surfaced instead of falling back to Mastra.
 *
 * SSE parsing adapted from legion-interlink/electron/agent/app-runtime.ts.
 */

import type { PluginAPI, PluginConfig } from '../shared/types.js';
import { buildDaemonHeaders, markDaemonReachable } from './daemon-client.js';
import { joinUrl, cleanText } from './utils.js';
import { USER_AGENT } from '../shared/constants.js';
import { debugLog } from './debug-log.js';

// ── Types (mirror Kai's StreamEvent subset) ─────────────────────────────

export type InferenceStreamEvent = {
  conversationId: string;
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  data?: unknown;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

/**
 * Minimum structural shape of a tool definition forwarded by the host.
 * Kept loose because the plugin forwards tools to the daemon and executes
 * returned client-passthrough calls without taking a hard type dependency on
 * Kai internals.
 */
export type InferenceTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  parameters?: unknown;
  input_schema?: unknown;
  execute?: (input: unknown, context: {
    toolCallId: string;
    conversationId?: string;
    abortSignal?: AbortSignal;
    onProgress?: (event: unknown) => void;
  }) => Promise<unknown>;
  source?: string;
  sourceId?: string;
  originalName?: string;
  aliases?: string[];
};

export type InferenceStreamOptions = {
  conversationId: string;
  messages: Array<{ role: string; content: unknown }>;
  modelKey?: string;
  systemPrompt: string;
  reasoningEffort?: string;
  abortSignal?: AbortSignal;
  tier?: string;
  provider?: string;
  /**
   * Tools provided by the host (Kai). Forwarded to the daemon's
   * /api/llm/inference endpoint so the LLM can be presented with a tool
   * schema. Optional — when absent or empty, the daemon receives no
   * `tools` field and the LLM runs without tool calling.
   */
  tools?: InferenceTool[];
};

export type TokenUsageData = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

// ── Module state ────────────────────────────────────────────────────────

let cachedApi: PluginAPI | null = null;
const DEFAULT_MODEL_KEYS = new Set(['legion', 'legionio']);

export function setInferenceApi(api: PluginAPI | null): void {
  cachedApi = api;
}

const USAGE_INPUT_KEYS = ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens'];
const USAGE_OUTPUT_KEYS = ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens'];
const USAGE_CACHE_READ_KEYS = [
  'cacheReadTokens',
  'cache_read_tokens',
  'cacheReadInputTokens',
  'cache_read_input_tokens',
  'cachedInputTokens',
  'cached_input_tokens',
];
const USAGE_CACHE_WRITE_KEYS = [
  'cacheWriteTokens',
  'cache_write_tokens',
  'cacheCreationInputTokens',
  'cache_creation_input_tokens',
];
const USAGE_TOTAL_KEYS = ['totalTokens', 'total_tokens'];

function toTokenCount(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim().length === 0) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function readTokenCount(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const count = toTokenCount(record[key]);
    if (count !== undefined) return count;
  }
  const nested = record.usage;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const key of keys) {
      const count = toTokenCount((nested as Record<string, unknown>)[key]);
      if (count !== undefined) return count;
    }
  }
  return undefined;
}

export function normalizeTokenUsage(value: unknown): TokenUsageData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const inputTokens = readTokenCount(record, USAGE_INPUT_KEYS);
  const outputTokens = readTokenCount(record, USAGE_OUTPUT_KEYS);
  const cacheReadTokens = readTokenCount(record, USAGE_CACHE_READ_KEYS);
  const cacheWriteTokens = readTokenCount(record, USAGE_CACHE_WRITE_KEYS);
  const totalTokens = readTokenCount(record, USAGE_TOTAL_KEYS);

  if (
    inputTokens === undefined
    && outputTokens === undefined
    && cacheReadTokens === undefined
    && cacheWriteTokens === undefined
    && totalTokens === undefined
  ) {
    return null;
  }

  const normalizedInput = inputTokens ?? 0;
  const normalizedOutput = outputTokens ?? 0;
  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheWriteTokens: cacheWriteTokens ?? 0,
    totalTokens: totalTokens ?? normalizedInput + normalizedOutput,
  };
}

// ── Working directory resolution ───────────────────────────────────────

function resolveWorkingDirectory(api: PluginAPI): string | null {
  try {
    const appConfig = api.config.get() as Record<string, unknown> | null;
    if (!appConfig) return null;

    const ui = appConfig.ui as Record<string, unknown> | undefined;
    if (!ui) return null;

    const activeId = ui.activeWorkspaceId as string | null;
    const workspaces = ui.workspaces as Array<{ id: string; directory: string }> | undefined;
    if (!activeId || !workspaces?.length) return null;

    const active = workspaces.find((w) => w.id === activeId);
    return active?.directory || null;
  } catch {
    return null;
  }
}

function buildSystemPromptWithCwd(api: PluginAPI, basePrompt: string | undefined): string {
  const cwd = resolveWorkingDirectory(api);
  if (!cwd) return basePrompt || '';

  const parts: string[] = [];
  if (basePrompt) parts.push(basePrompt);
  parts.push(`Current working directory: ${cwd}`);
  parts.push(
    'IMPORTANT: Use this directory as the default base path for ALL file operations and shell commands. '
    + 'When executing tools that accept a path or cwd parameter, use this directory. '
    + 'NEVER search from / or ~ to locate the project — the working directory is already set.',
  );
  return parts.join('\n\n');
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Check whether the daemon is considered online based on the last
 * syncRuntime result stored in plugin state.
 */
export function isDaemonOnline(): boolean {
  if (!cachedApi) return false;
  const state = cachedApi.state.get() || {};
  return (state as Record<string, unknown>).status === 'online';
}

/**
 * Stream inference from the Legion daemon.
 * Yields events compatible with Kai's StreamEvent type.
 */
export async function* streamDaemonInference(
  options: InferenceStreamOptions,
): AsyncGenerator<InferenceStreamEvent> {
  // ── Latency: t0 = request start ─────────────────────────────────────────
  const t0 = Date.now();

  if (!cachedApi) {
    yield { conversationId: options.conversationId, type: 'error', error: 'Legion plugin API not initialized.' };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const { getPluginConfig } = await import('./index.js');
  const config = getPluginConfig(cachedApi);

  if (!config.daemonUrl) {
    yield { conversationId: options.conversationId, type: 'error', error: 'Legion daemon URL is not configured.' };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const inferenceUrl = joinUrl(config.daemonUrl, config.streamPath || '/api/llm/inference');
  const normalizedMessages = normalizeMessages(options.messages);

  if (normalizedMessages.length === 0 || !normalizedMessages.some((m) => m.role === 'user')) {
    yield { conversationId: options.conversationId, type: 'error', error: 'No user message was provided.' };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const toolDeclarations = serializeToolsForDaemon(options.tools);
  const conversationMessages = [...normalizedMessages];

  // Look up per-conversation routing overrides
  const pluginData = cachedApi.config.getPluginData() as Record<string, unknown>;
  const routingMap = (pluginData.conversationRouting || {}) as Record<string, Record<string, string>>;
  const convRouting = routingMap[options.conversationId] || {};

  const routingDefaults: Record<string, unknown> = {};
  if (options.modelKey && !DEFAULT_MODEL_KEYS.has(options.modelKey.toLowerCase())) {
    routingDefaults.model = options.modelKey;
  }
  if (options.provider) routingDefaults.provider = options.provider;
  if (options.tier) routingDefaults.tier = options.tier;

  // Per-conversation overrides take priority over what was passed in options
  if (convRouting.tier && !routingDefaults.tier) routingDefaults.tier = convRouting.tier;
  if (convRouting.provider && !routingDefaults.provider) routingDefaults.provider = convRouting.provider;
  if (convRouting.model && !routingDefaults.model) routingDefaults.model = convRouting.model;

  // Global defaults as final fallback
  const defaultTier = (pluginData.defaultTier as string) || '';
  const defaultProvider = (pluginData.defaultProvider as string) || '';
  const defaultModel = (pluginData.defaultModel as string) || '';
  if (defaultTier && !routingDefaults.tier) routingDefaults.tier = defaultTier;
  if (defaultProvider && !routingDefaults.provider) routingDefaults.provider = defaultProvider;
  if (defaultModel && !routingDefaults.model) routingDefaults.model = defaultModel;

  const legionOptions: Record<string, unknown> = {};
  const systemPrompt = buildSystemPromptWithCwd(cachedApi, options.systemPrompt);
  if (systemPrompt) legionOptions.system = systemPrompt;
  if (options.conversationId) legionOptions.conversation_id = options.conversationId;
  if (options.reasoningEffort) legionOptions.reasoning_effort = options.reasoningEffort;
  legionOptions.include_thinking = true;
  legionOptions.client_tool_passthrough = true;
  legionOptions.request_id = `kai-${options.conversationId}-${Date.now()}`;
  const workingDirectory = resolveWorkingDirectory(cachedApi);
  if (workingDirectory) legionOptions.cwd = workingDirectory;

  // Forward knowledge config if available
  if (pluginData.knowledgeRagEnabled !== undefined) {
    legionOptions.rag_enabled = pluginData.knowledgeRagEnabled;
  }
  if (pluginData.knowledgeCaptureEnabled !== undefined) {
    legionOptions.capture_enabled = pluginData.knowledgeCaptureEnabled;
  }
  if (pluginData.knowledgeScope) {
    legionOptions.knowledge_scope = pluginData.knowledgeScope;
  }

  const serializedToolBytes = JSON.stringify(toolDeclarations).length;
  const maxToolRounds = 12;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const requestBody: Record<string, unknown> = {
      messages: conversationMessages,
      stream: true,
      ...routingDefaults,
      ...legionOptions,
      // Forward host-provided tool definitions to the daemon. The daemon can
      // decide which tool to call; this plugin executes returned client tool
      // calls and feeds their results back through the next inference round.
      ...(toolDeclarations.length > 0 ? { tools: toolDeclarations } : {}),
    };

    // ── Latency: t1 = just before fetch (measures setup overhead) ────────────
    const t1 = Date.now();

    // ── Debug: log request metadata + setup latency before sending ──────────
    debugLog('inference:request', {
      url: inferenceUrl,
      modelKey: options.modelKey,
      toolCount: toolDeclarations.length,
      serializedToolBytes,
      round,
      latency: { setupMs: t1 - t0 },
      requestBody: {
        ...requestBody,
        ...(toolDeclarations.length > 0
          ? { tools: `[${toolDeclarations.length} compact tool schemas, ${serializedToolBytes} bytes]` }
          : {}),
        messages: (requestBody.messages as unknown[])?.map((m: unknown) => {
          const msg = m as Record<string, unknown>;
          // Truncate content for readability
          const content = typeof msg.content === 'string'
            ? msg.content.slice(0, 200) + (msg.content.length > 200 ? '…' : '')
            : msg.content;
          return { ...msg, content };
        }),
      },
    });

    let response: Response;
    try {
      response = await cachedApi.fetch(inferenceUrl, {
        method: 'POST',
        headers: buildDaemonHeaders(config, {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        }),
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });
    } catch (error) {
      markDaemonReachable(false);
      const msg = `Daemon inference request failed: ${error instanceof Error ? error.message : String(error)}`;
      debugLog('inference:fetch-error', { error: msg, round, latency: { setupMs: t1 - t0, fetchMs: Date.now() - t1, totalMs: Date.now() - t0 } });
      throw new Error(msg);
    }

    // ── Latency: t2 = response headers received (TTFB) ──────────────────────
    const t2 = Date.now();

    debugLog('inference:response', {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      round,
      latency: { setupMs: t1 - t0, networkMs: t2 - t1, totalMs: t2 - t0 },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 0 || response.status >= 500) {
        markDaemonReachable(false);
      }
      debugLog('inference:http-error', { status: response.status, body: body.slice(0, 1000), round, latency: { setupMs: t1 - t0, networkMs: t2 - t1, totalMs: t2 - t0 } });
      throw new Error(`Daemon inference HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    markDaemonReachable(true);

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      yield* handleSyncResponse(options.conversationId, response, options.modelKey);
      return;
    }

    let donePayload: Record<string, unknown> | null = null;
    let emittedText = false;
    for await (const event of consumeDaemonSSE(options.conversationId, response.body, options.modelKey, options.abortSignal, t0, t2, false)) {
      if (event.type === 'done') {
        donePayload = isRecord(event.data) ? event.data : {};
        break;
      }
      if (event.type === 'error' && !emittedText) {
        throw new Error(event.error ?? 'Daemon stream error before response');
      }
      if (event.type === 'text-delta') emittedText = true;
      yield event;
    }

    const toolCalls = normalizeOpenAIToolCalls(donePayload?.tool_calls);
    const requiresToolResult = donePayload?.requires_tool_result === true || donePayload?.stop_reason === 'tool_use';
    if (!requiresToolResult || toolCalls.length === 0) {
      const finalDone: InferenceStreamEvent = { conversationId: options.conversationId, type: 'done', data: donePayload ?? {} };
      const sourceModel = cleanText((donePayload?.model as string) ?? (donePayload?.model_name as string) ?? (donePayload?.modelName as string) ?? '');
      if (sourceModel) (finalDone as Record<string, unknown>).messageMeta = { sourceModel };
      yield finalDone;
      return;
    }

    if (round >= maxToolRounds) {
      yield {
        conversationId: options.conversationId,
        type: 'error',
        error: `Legion inference exceeded ${maxToolRounds} client tool callback rounds.`,
      };
      yield { conversationId: options.conversationId, type: 'done', data: donePayload };
      return;
    }

    conversationMessages.push({
      role: 'assistant',
      content: typeof donePayload?.content === 'string' && donePayload.content.length > 0 ? donePayload.content : ' ',
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolMessage = yield* executeClientToolCall(options.conversationId, toolCall, options.tools, options.abortSignal);
      conversationMessages.push(toolMessage);
    }
  }

  yield {
    conversationId: options.conversationId,
    type: 'error',
    error: `Legion inference exceeded ${maxToolRounds} client tool callback rounds.`,
  };
  yield { conversationId: options.conversationId, type: 'done' };
}

// ── Message normalisation ───────────────────────────────────────────────

type DaemonToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const toolSchemaCache = new WeakMap<object, Record<string, unknown>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clonePlainObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function zodToJsonSchemaObject(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return { type: 'object', properties: {} };

  const cached = toolSchemaCache.get(schema);
  if (cached) return cached;

  const toJSONSchema = schema.toJSONSchema;
  if (typeof toJSONSchema === 'function') {
    try {
      const jsonSchema = toJSONSchema.call(schema);
      const result = clonePlainObject(jsonSchema) ?? { type: 'object', properties: {} };
      delete result.$schema;
      toolSchemaCache.set(schema, result);
      return result;
    } catch {
      // Fall through to permissive fallback.
    }
  }

  const fallback = { type: 'object', properties: {} };
  toolSchemaCache.set(schema, fallback);
  return fallback;
}

function normalizeToolSchema(tool: InferenceTool): Record<string, unknown> {
  return clonePlainObject(tool.parameters)
    ?? clonePlainObject(tool.input_schema)
    ?? zodToJsonSchemaObject(tool.inputSchema);
}

function shouldForwardToolToDaemon(tool: InferenceTool): boolean {
  // The Legion plugin's own Kai-side tool is a wrapper around the same daemon.
  // If advertised to the daemon, the model can call it, but there is no
  // host-tool execution bridge in the plugin inference-provider path, so Kai
  // receives a tool-call with no matching tool-result and marks it hung.
  if (tool.source === 'plugin' && tool.sourceId === 'legion') return false;
  if (tool.name === 'plugin__legion__daemon') return false;
  return true;
}

function serializeToolsForDaemon(tools: InferenceTool[] | undefined): DaemonToolDeclaration[] {
  if (!tools?.length) return [];

  return tools
    .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0 && shouldForwardToolToDaemon(tool))
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      parameters: normalizeToolSchema(tool),
    }));
}

/**
 * Daemon-compatible message shape.
 *
 * The Legion daemon (`legion-llm` gem, `lib/legion/llm/call/lex_llm_adapter.rb`)
 * accepts OpenAI-style messages: `role`, `content` (string), plus optional
 * `tool_calls` (assistant messages) and `tool_call_id` (tool messages). The
 * adapter at line 110-115 of lex_llm_adapter.rb maps these directly onto
 * lex-llm's `Message` class, which providers translate to native shapes.
 *
 * Content is sent as a string (not an array): the adapter does `content.to_s`,
 * which would produce garbage if given a content-block array. See
 * `routes_inference_spec.rb` for the canonical input shape.
 */
type NormalizedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type NormalizedMessage = {
  role: string;
  content: string;
  tool_calls?: NormalizedToolCall[];
  tool_call_id?: string;
  tool_name?: string;
};

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const typed = part as { type?: string; text?: string; filename?: string };
      switch (typed.type) {
        case 'text': return typed.text ?? '';
        case 'image': return '[Image]';
        case 'file': return typed.filename ? `[File: ${typed.filename}]` : '[File]';
        default: return '';
      }
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Stringify a tool result for the daemon's `content` field. */
function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  if (typeof result === 'object') {
    const typed = result as { isError?: boolean; error?: unknown };
    if (typed.isError) {
      const err = typed.error;
      return typeof err === 'string' ? `Error: ${err}` : `Error: ${JSON.stringify(err)}`;
    }
    try { return JSON.stringify(result); } catch { return String(result); }
  }
  return String(result);
}

function normalizeOpenAIToolCalls(value: unknown): NormalizedToolCall[] {
  if (!Array.isArray(value)) return [];

  const calls: NormalizedToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const fn = isRecord(item.function) ? item.function : {};
    const id = typeof item.id === 'string' && item.id.trim().length > 0
      ? item.id
      : '';
    const name = typeof fn.name === 'string' && fn.name.trim().length > 0
      ? fn.name
      : typeof item.name === 'string' && item.name.trim().length > 0
        ? item.name
        : '';

    if (!id || !name) continue;

    let argString = '{}';
    if (typeof fn.arguments === 'string') {
      argString = fn.arguments;
    } else if (typeof item.arguments === 'string') {
      argString = item.arguments;
    } else {
      try {
        argString = JSON.stringify(item.arguments ?? {});
      } catch {
        argString = '{}';
      }
    }

    calls.push({ id, name, arguments: argString });
  }

  return calls;
}

function parseToolArguments(argumentsJson: string): unknown {
  if (!argumentsJson || argumentsJson.trim().length === 0) return {};
  try {
    return JSON.parse(argumentsJson) as unknown;
  } catch {
    return {};
  }
}

function findExecutableTool(tools: InferenceTool[] | undefined, name: string): InferenceTool | undefined {
  return tools?.find((tool) => (
    tool.name === name
    || tool.originalName === name
    || tool.aliases?.includes(name)
  ));
}

async function* executeClientToolCall(
  conversationId: string,
  toolCall: NormalizedToolCall,
  tools: InferenceTool[] | undefined,
  abortSignal?: AbortSignal,
): AsyncGenerator<InferenceStreamEvent, NormalizedMessage, unknown> {
  const toolName = toolCall.name;
  const args = parseToolArguments(toolCall.arguments);
  const startedAt = new Date().toISOString();

  yield {
    conversationId,
    type: 'tool-call',
    toolCallId: toolCall.id,
    toolName,
    args,
    startedAt,
  };

  const executable = findExecutableTool(tools, toolName);
  if (!executable?.execute) {
    const result = { isError: true, error: `Tool ${toolName} is not executable by Kai.` };
    const finishedAt = new Date().toISOString();
    yield {
      conversationId,
      type: 'tool-result',
      toolCallId: toolCall.id,
      toolName,
      result,
      startedAt,
      finishedAt,
    };
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      tool_name: toolName,
      content: stringifyToolResult(result),
    };
  }

  try {
    const progressEvents: InferenceStreamEvent[] = [];
    const result = await executable.execute(args, {
      toolCallId: toolCall.id,
      conversationId,
      abortSignal,
      onProgress: (progress) => {
        progressEvents.push({
          conversationId,
          type: 'tool-progress',
          toolCallId: toolCall.id,
          toolName,
          data: progress,
        });
      },
    });
    for (const pe of progressEvents) yield pe;
    const finishedAt = new Date().toISOString();
    yield {
      conversationId,
      type: 'tool-result',
      toolCallId: toolCall.id,
      toolName,
      result,
      startedAt,
      finishedAt,
    };
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      tool_name: toolName,
      content: stringifyToolResult(result),
    };
  } catch (error) {
    const result = { isError: true, error: error instanceof Error ? error.message : String(error) };
    const finishedAt = new Date().toISOString();
    yield {
      conversationId,
      type: 'tool-result',
      toolCallId: toolCall.id,
      toolName,
      result,
      startedAt,
      finishedAt,
    };
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      tool_name: toolName,
      content: stringifyToolResult(result),
    };
  }
}

/**
 * Translate Kai's AI SDK V4 CoreMessage shape into the daemon's native shape.
 *
 *   IN  (V4):  assistant content [{type:'text'}, {type:'tool-call', toolCallId, toolName, args}]
 *              followed by tool role with content [{type:'tool-result', toolCallId, toolName, result}]
 *   OUT (lex): {role:'assistant', content:'<text>', tool_calls:[{id, name, arguments}]}
 *              {role:'tool', tool_call_id, tool_name, content:'<stringified result>'}
 */
function normalizeMessages(messages: Array<{ role: string; content: unknown }>): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];

  for (const message of messages) {
    const role = (message.role ?? '').toString();
    if (!role) continue;

    // System and user messages: extract text only. The daemon accepts these
    // verbatim once stringified.
    if (role === 'system' || role === 'user') {
      const text = extractText(message.content);
      if (!text) continue;
      out.push({ role, content: text });
      continue;
    }

    // Tool messages: AI SDK V4 wraps results in a content array of
    // {type:'tool-result'} blocks. Each result becomes its own top-level
    // {role:'tool'} message in OpenAI/lex-llm format.
    if (role === 'tool') {
      if (!Array.isArray(message.content)) {
        const text = extractText(message.content);
        if (text) out.push({ role: 'tool', content: text });
        continue;
      }
      for (const part of message.content as Array<Record<string, unknown>>) {
        const partType = (part?.type ?? '').toString();
        if (partType !== 'tool-result' && partType !== 'tool_result') continue;
        const toolCallId = (part.toolCallId as string) ?? (part.tool_call_id as string) ?? '';
        const toolName = (part.toolName as string) ?? (part.tool_name as string) ?? '';
        out.push({
          role: 'tool',
          content: stringifyToolResult(part.result),
          ...(toolCallId ? { tool_call_id: toolCallId } : {}),
          ...(toolName ? { tool_name: toolName } : {}),
        });
      }
      continue;
    }

    // Assistant messages: split content into a text body + tool_calls array.
    // The daemon's adapter reads tool_calls as a top-level field.
    if (role === 'assistant') {
      if (!Array.isArray(message.content)) {
        const text = extractText(message.content);
        if (!text) continue;
        out.push({ role: 'assistant', content: text });
        continue;
      }

      const textParts: string[] = [];
      const toolCalls: NormalizedToolCall[] = [];

      for (const part of message.content as Array<Record<string, unknown>>) {
        const partType = (part?.type ?? '').toString();
        if (partType === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
          continue;
        }
        if (partType === 'tool-call' || partType === 'tool_call') {
          const id = (part.toolCallId as string) ?? (part.tool_call_id as string) ?? '';
          const name = (part.toolName as string) ?? (part.tool_name as string) ?? '';
          if (!id || !name) continue;
          let argString: string;
          try {
            argString = JSON.stringify(part.args ?? part.arguments ?? {});
          } catch {
            argString = '{}';
          }
          toolCalls.push({ id, name, arguments: argString });
        }
        // image/file/other parts on assistant messages are dropped — the
        // daemon's content field is text-only.
      }

      const text = textParts.join('\n').trim();
      if (!text && toolCalls.length === 0) continue;

      const assistantMsg: NormalizedMessage = {
        role: 'assistant',
        // Daemon validator requires non-empty content. Use a single space as
        // a placeholder when the assistant turn was tool-only.
        content: text || ' ',
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      out.push(assistantMsg);
      continue;
    }

    // Unknown role — pass through as text if extractable, otherwise drop.
    const text = extractText(message.content);
    if (text) out.push({ role, content: text });
  }

  return out;
}

// ── SSE parser (adapted from interlink's consumeDaemonSSE) ──────────────

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function normalizeDaemonEventName(eventName: string | undefined, payload: Record<string, unknown>): string {
  if (eventName && eventName.trim().length > 0) return eventName.trim();
  const payloadType = payload.type;
  return typeof payloadType === 'string' ? payloadType.trim() : '';
}

async function* consumeDaemonSSE(
  conversationId: string,
  body: ReadableStream<Uint8Array>,
  requestedModelKey: string | undefined,
  abortSignal?: AbortSignal,
  t0?: number,
  t2?: number,
  emitSyntheticDone = true,
): AsyncGenerator<InferenceStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAny = false;
  let firstTokenLogged = false;
  let currentEventName = '';
  let currentDataLines: string[] = [];

  try {
    const flushEvent = (): InferenceStreamEvent[] => {
      if (!currentEventName && currentDataLines.length === 0) return [];

      const rawData = currentDataLines.join('\n').trim();
      const explicitEventName = currentEventName;
      currentEventName = '';
      currentDataLines = [];

      if (!rawData || rawData === '[DONE]') return [];

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return [{ conversationId, type: 'text-delta', text: rawData }];
      }

      const eventName = normalizeDaemonEventName(explicitEventName, payload);
      if (!eventName) return [];

      // Log every SSE event from the daemon (truncate large payloads)
      debugLog('inference:sse-event', {
        eventName,
        payload: JSON.stringify(payload).slice(0, 500),
      });

      if (eventName === 'text-delta' || eventName === 'text_delta' || eventName === 'delta') {
        const text = (payload.text as string) || (payload.delta as string) || '';
        return text ? [{ conversationId, type: 'text-delta', text }] : [];
      }

      if (eventName === 'thinking-delta' || eventName === 'thinking_delta') {
        const delta = (payload.delta as string) || (payload.text as string) || '';
        return delta ? [{ conversationId, type: 'observer-message', text: delta }] : [];
      }

      if (eventName === 'tool-call' || eventName === 'tool_call') {
        return [{
          conversationId,
          type: 'tool-call',
          toolCallId: (payload.toolCallId as string) ?? (payload.tool_call_id as string),
          toolName: (payload.toolName as string) ?? (payload.tool_name as string),
          args: payload.args ?? payload.parameters ?? {},
          startedAt: toIsoTimestamp(payload.startedAt ?? payload.started_at ?? payload.timestamp) ?? new Date().toISOString(),
        }];
      }

      if (eventName === 'tool-result' || eventName === 'tool_result') {
        return [{
          conversationId,
          type: 'tool-result',
          toolCallId: (payload.toolCallId as string) ?? (payload.tool_call_id as string),
          toolName: (payload.toolName as string) ?? (payload.tool_name as string),
          result: payload.result ?? payload.content,
          startedAt: toIsoTimestamp(payload.startedAt ?? payload.started_at) ?? undefined,
          finishedAt: toIsoTimestamp(payload.finishedAt ?? payload.finished_at ?? payload.timestamp) ?? new Date().toISOString(),
          durationMs: typeof payload.durationMs === 'number' ? payload.durationMs
            : typeof payload.duration_ms === 'number' ? payload.duration_ms
              : undefined,
        }];
      }

      if (eventName === 'tool-error' || eventName === 'tool_error') {
        return [{
          conversationId,
          type: 'tool-result',
          toolCallId: (payload.toolCallId as string) ?? (payload.tool_call_id as string),
          toolName: (payload.toolName as string) ?? (payload.tool_name as string),
          result: { isError: true, error: payload.error ?? payload.message ?? 'Tool execution failed' },
          startedAt: toIsoTimestamp(payload.startedAt ?? payload.started_at) ?? undefined,
          finishedAt: toIsoTimestamp(payload.finishedAt ?? payload.finished_at ?? payload.timestamp) ?? new Date().toISOString(),
        }];
      }

      if (eventName === 'tool-progress' || eventName === 'tool_progress') {
        return [{
          conversationId,
          type: 'tool-progress',
          toolCallId: (payload.toolCallId as string) ?? (payload.tool_call_id as string),
          toolName: (payload.toolName as string) ?? (payload.tool_name as string),
          data: payload,
        }];
      }

      if (eventName === 'error') {
        return [{
          conversationId,
          type: 'error',
          error: (payload.error as string) || (payload.message as string) || 'Daemon stream error',
        }];
      }

      if (eventName === 'enrichment' || eventName === 'enrichments') {
        return [{ conversationId, type: 'enrichment', data: payload }];
      }

      if (eventName === 'done') {
        const events: InferenceStreamEvent[] = [];
        // ── Latency: t4 = done event received ───────────────────────────
        const now = Date.now();
        debugLog('inference:latency:done', {
          totalStreamMs: t0 !== undefined ? now - t0 : undefined,
          streamBodyMs: t2 !== undefined ? now - t2 : undefined,
          ttfbMs: t2 !== undefined ? t2 - (t0 ?? t2) : undefined,
        });
        // Extract pipeline enrichments from the done payload
        const enrichments = payload.enrichments ?? payload.pipeline_enrichments;
        if (enrichments && typeof enrichments === 'object' && !Array.isArray(enrichments)) {
          events.push({ conversationId, type: 'enrichment', data: enrichments });
        }
        const usage = normalizeTokenUsage(payload);
        if (usage) {
          events.push({
            conversationId,
            type: 'context-usage',
            data: usage,
          });
        }
        // Extract the model actually used by the daemon and stamp it into
        // messageMeta.sourceModel so Kai's popover can display it.
        const usedModel = cleanText(
          (payload.model as string) ??
          (payload.model_name as string) ??
          (payload.modelName as string) ??
          '',
        );
        const doneEvent: InferenceStreamEvent = { conversationId, type: 'done', data: payload };
        if (usedModel) (doneEvent as Record<string, unknown>).messageMeta = { sourceModel: usedModel };
        events.push(doneEvent);
        return events;
      }

      if (eventName === 'context_usage' || eventName === 'context-usage') {
        return [{ conversationId, type: 'context-usage', data: normalizeTokenUsage(payload) ?? payload }];
      }

      if (eventName === 'model-fallback' || eventName === 'model_fallback') {
        return [{ conversationId, type: 'model-fallback', data: payload }];
      }

      // Fallback: if payload has a response string, treat as text-delta
      if (payload.response && typeof payload.response === 'string') {
        return [{ conversationId, type: 'text-delta', text: payload.response as string }];
      }

      return [];
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.replace(/\r$/, '');
        if (!trimmedLine) {
          const events = flushEvent();
          for (const event of events) {
            emittedAny = true;
            // ── Latency: t3 = first SSE event yielded ───────────────────
            if (!firstTokenLogged) {
              firstTokenLogged = true;
              const now = Date.now();
              debugLog('inference:latency:first-token', {
                ttfbMs: t2 !== undefined ? t2 - (t0 ?? t2) : undefined,
                timeToFirstTokenMs: t0 !== undefined ? now - t0 : undefined,
                streamingStartMs: t2 !== undefined ? now - t2 : undefined,
                eventType: event.type,
              });
            }
            yield event;
          }
          continue;
        }
        if (trimmedLine.startsWith(':')) continue;
        if (trimmedLine.startsWith('event:')) {
          currentEventName = trimmedLine.slice(6).trim();
          continue;
        }
        if (trimmedLine.startsWith('data:')) {
          currentDataLines.push(trimmedLine.slice(5).trimStart());
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      const finalLine = buffer.replace(/\r$/, '');
      if (finalLine.startsWith('event:')) {
        currentEventName = finalLine.slice(6).trim();
      } else if (finalLine.startsWith('data:')) {
        currentDataLines.push(finalLine.slice(5).trimStart());
      }
    }

    const trailingEvents = flushEvent();
    for (const event of trailingEvents) {
      emittedAny = true;
      yield event;
    }
  } catch (error) {
    if (!abortSignal?.aborted) {
      const msg = `SSE stream error: ${error instanceof Error ? error.message : String(error)}`;
      const now = Date.now();
      debugLog('inference:sse-error', { error: msg, latency: { totalMs: t0 !== undefined ? now - t0 : undefined, streamBodyMs: t2 !== undefined ? now - t2 : undefined } });
      yield {
        conversationId,
        type: 'error',
        error: msg,
      };
    }
  } finally {
    reader.releaseLock();
  }

  if (!emittedAny && !abortSignal?.aborted) {
    const now = Date.now();
    debugLog('inference:sse-no-output', { latency: { totalMs: t0 !== undefined ? now - t0 : undefined, streamBodyMs: t2 !== undefined ? now - t2 : undefined } });
    yield {
      conversationId,
      type: 'error',
      error: 'Daemon SSE stream ended without producing any output.',
    };
  }
  if (emitSyntheticDone) {
    // Synthetic done — stamp the requested model key so the UI indicator shows
    // which model was used even if the daemon errored before sending its own done.
    const syntheticDone: InferenceStreamEvent = { conversationId, type: 'done' };
    if (requestedModelKey) (syntheticDone as Record<string, unknown>).messageMeta = { sourceModel: requestedModelKey };
    yield syntheticDone;
  }
}

// ── Sync response handler ───────────────────────────────────────────────

async function* handleSyncResponse(
  conversationId: string,
  response: Response,
  requestedModelKey?: string,
): AsyncGenerator<InferenceStreamEvent> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const data = body && typeof body === 'object'
    ? body as { data?: Record<string, unknown>; error?: { message?: string } }
    : {} as { data?: Record<string, unknown>; error?: { message?: string } };

  if (!response.ok) {
    const errorMessage = data.error?.message || `Daemon request failed with HTTP ${response.status}.`;
    yield { conversationId, type: 'error', error: errorMessage };
    const errDone: InferenceStreamEvent = { conversationId, type: 'done' };
    if (requestedModelKey) (errDone as Record<string, unknown>).messageMeta = { sourceModel: requestedModelKey };
    yield errDone;
    return;
  }

  const text = typeof data.data?.content === 'string'
    ? data.data.content
    : typeof data.data?.response === 'string'
      ? data.data.response
      : '';

  if (text) {
    yield { conversationId, type: 'text-delta', text };
  } else {
    yield {
      conversationId,
      type: 'error',
      error: 'Daemon returned an unexpected payload.',
    };
  }
  const syncDone: InferenceStreamEvent = { conversationId, type: 'done' };
  if (requestedModelKey) (syncDone as Record<string, unknown>).messageMeta = { sourceModel: requestedModelKey };
  yield syncDone;
}
