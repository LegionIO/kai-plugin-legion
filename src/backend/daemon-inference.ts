/**
 * Daemon inference provider for the Kai plugin API.
 *
 * Streams LLM inference through the Legion daemon's /api/llm/inference
 * endpoint. When the daemon is online this provider handles all inference;
 * when offline Kai's standard Mastra pipeline takes over automatically.
 *
 * SSE parsing adapted from legion-interlink/electron/agent/app-runtime.ts.
 */

import type { PluginAPI, PluginConfig } from '../shared/types.js';
import { buildDaemonHeaders, markDaemonReachable } from './daemon-client.js';
import { joinUrl, cleanText } from './utils.js';
import { USER_AGENT } from '../shared/constants.js';

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

export type InferenceStreamOptions = {
  conversationId: string;
  messages: Array<{ role: string; content: unknown }>;
  modelKey: string;
  systemPrompt: string;
  reasoningEffort?: string;
  abortSignal?: AbortSignal;
};

// ── Module state ────────────────────────────────────────────────────────

let cachedApi: PluginAPI | null = null;

export function setInferenceApi(api: PluginAPI | null): void {
  cachedApi = api;
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
  if (!cachedApi) {
    yield { conversationId: options.conversationId, type: 'error', error: 'Legion plugin API not initialized.' };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const { getPluginConfig } = await import('./config.js');
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

  const requestBody: Record<string, unknown> = {
    messages: normalizedMessages,
    stream: true,
    ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
  };

  // Forward knowledge config if available
  const pluginData = cachedApi.config.getPluginData() as Record<string, unknown>;
  if (pluginData.knowledgeRagEnabled !== undefined) {
    requestBody.rag_enabled = pluginData.knowledgeRagEnabled;
  }
  if (pluginData.knowledgeCaptureEnabled !== undefined) {
    requestBody.capture_enabled = pluginData.knowledgeCaptureEnabled;
  }
  if (pluginData.knowledgeScope) {
    requestBody.knowledge_scope = pluginData.knowledgeScope;
  }

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
    throw new Error(`Daemon inference request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 0 || response.status >= 500) {
      markDaemonReachable(false);
    }
    throw new Error(`Daemon inference HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  markDaemonReachable(true);

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream') && response.body) {
    yield* consumeDaemonSSE(options.conversationId, response.body, options.abortSignal);
    return;
  }

  // Non-streaming fallback — synchronous JSON response
  yield* handleSyncResponse(options.conversationId, response);
}

// ── Message normalisation ───────────────────────────────────────────────

type NormalizedMessage = {
  role: string;
  content: Array<{ type: string; text: string }>;
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

function normalizeMessages(messages: Array<{ role: string; content: unknown }>): NormalizedMessage[] {
  return messages
    .map((message) => {
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : '';
      if (!role) return null;
      const text = extractText(message.content);
      if (!text) return null;
      return { role, content: [{ type: 'text', text }] };
    })
    .filter((message): message is NormalizedMessage => message !== null);
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
  abortSignal?: AbortSignal,
): AsyncGenerator<InferenceStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAny = false;
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

      if (eventName === 'text-delta' || eventName === 'text_delta' || eventName === 'delta') {
        const text = (payload.text as string) || (payload.delta as string) || '';
        return text ? [{ conversationId, type: 'text-delta', text }] : [];
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
        // Extract pipeline enrichments from the done payload
        const enrichments = payload.enrichments ?? payload.pipeline_enrichments;
        if (enrichments && typeof enrichments === 'object' && !Array.isArray(enrichments)) {
          events.push({ conversationId, type: 'enrichment', data: enrichments });
        }
        // Extract token usage and emit as context-usage
        const toCount = (v: unknown): number | undefined => {
          const n = Number(v);
          return Number.isFinite(n) ? n : undefined;
        };
        const inputTokens = toCount(payload.input_tokens ?? payload.inputTokens);
        const outputTokens = toCount(payload.output_tokens ?? payload.outputTokens);
        const cacheReadTokens = toCount(payload.cache_read_tokens ?? payload.cacheReadTokens);
        const cacheWriteTokens = toCount(payload.cache_write_tokens ?? payload.cacheWriteTokens);
        if (inputTokens !== undefined || outputTokens !== undefined) {
          events.push({
            conversationId,
            type: 'context-usage',
            data: {
              inputTokens: inputTokens ?? 0,
              outputTokens: outputTokens ?? 0,
              cacheReadTokens: cacheReadTokens ?? 0,
              cacheWriteTokens: cacheWriteTokens ?? 0,
              totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
            },
          });
        }
        events.push({ conversationId, type: 'done', data: payload });
        return events;
      }

      if (eventName === 'context_usage' || eventName === 'context-usage') {
        return [{ conversationId, type: 'context-usage', data: payload }];
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
      yield {
        conversationId,
        type: 'error',
        error: `SSE stream error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } finally {
    reader.releaseLock();
  }

  if (!emittedAny && !abortSignal?.aborted) {
    yield {
      conversationId,
      type: 'error',
      error: 'Daemon SSE stream ended without producing any output.',
    };
  }
  yield { conversationId, type: 'done' };
}

// ── Sync response handler ───────────────────────────────────────────────

async function* handleSyncResponse(
  conversationId: string,
  response: Response,
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
    yield { conversationId, type: 'done' };
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
  yield { conversationId, type: 'done' };
}
