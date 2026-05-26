/**
 * kai-plugin-legion — main entry point.
 *
 * Registers LegionIO as the preferred inference runtime in Kai.
 * When enabled and the daemon is online, all LLM inference (tool calls,
 * compaction, memory, etc.) routes through the LegionIO daemon.
 * Falls back to Kai's built-in pipeline automatically when offline.
 */

import type { PluginAPI, PluginConfig } from '../shared/types.js';
import { HEALTH_POLL_MS, BANNER_ID } from '../shared/constants.js';
import { isDaemonOnline, streamDaemonInference, setInferenceApi } from './daemon-inference.js';
import { daemonJson, markDaemonReachable, setConfigProvider } from './daemon-client.js';
import { registerTool } from './tool.js';

// ── Module state ─────────────────────────────────────────────────────────────

let currentApi: PluginAPI | null = null;
let healthPollTimer: ReturnType<typeof setInterval> | null = null;
let backendRegistered = false;

// ── Config helper ─────────────────────────────────────────────────────────────

/**
 * Resolve plugin config, merging user settings with internal defaults.
 * Only `enabled` and `daemonUrl` are user-configurable via the settings UI.
 * All other fields are hardcoded defaults consumed by daemon-client and
 * daemon-inference internals.
 */
export type ApiEndpointMode = 'native' | 'openai';

export function getPluginConfig(api: PluginAPI): PluginConfig {
  const data = (api.config.getPluginData() || {}) as Record<string, unknown>;
  const apiEndpoint = (data.apiEndpoint as string) === 'openai' ? 'openai' : 'native';
  return {
    enabled: data.enabled !== false,
    daemonUrl: (data.daemonUrl as string) || 'http://127.0.0.1:4567',
    apiEndpoint,
    // Internal defaults — not exposed in configSchema
    apiKey: (data.apiKey as string) || '',
    configDir: (data.configDir as string) || '',
    readyPath: '/api/ready',
    healthPath: '/api/health',
    streamPath: '/api/llm/inference',
    backendEnabled: true,
  };
}

// ── Model catalog sync ────────────────────────────────────────────────────────

type DaemonModel = {
  id: string;
  types?: string[];
  capabilities?: string[];
  model_families?: string[];
  providers?: string[];
  instances?: string[];
  max_context?: number | null;
  enabled?: boolean;
};

// Exact-match signals that indicate a model is NOT a chat/text model.
// We only check the model ID and capabilities as whole tokens (exact or word-boundary),
// not substrings — "embeddings" in qwen's capability list should not exclude it.
const NON_CHAT_EXACT = new Set([
  'embed', 'embedding', 'embeddings',
  'speech-to-text', 'text-to-speech', 'tts', 'stt',
  'realtime', 'transcription', 'transcribe',
]);

// Substrings checked only against the model ID (not capabilities).
const NON_CHAT_ID_SIGNALS = [
  'embed', 'speech', 'realtime', 'image', 'video', 'transcri', 'tts', 'stt',
];

function isDaemonChatModel(m: DaemonModel): boolean {
  if (!m.id || m.enabled === false) return false;
  if (!m.types?.includes('inference')) return false;
  // Exclude if the model ID contains a non-chat signal
  const idLower = m.id.toLowerCase();
  if (NON_CHAT_ID_SIGNALS.some((s) => idLower.includes(s))) return false;
  // Exclude if *all* capabilities are non-chat (e.g. a pure-embed model that also has types=['inference'])
  const caps = (m.capabilities ?? []).map((s) => s.toLowerCase());
  const chatCaps = caps.filter((c) => !NON_CHAT_EXACT.has(c));
  if (caps.length > 0 && chatCaps.length === 0) return false;
  return true;
}

function mapDaemonModelToKaiCatalog(m: DaemonModel): Record<string, unknown> {
  const displayName = m.id
    .replace(/[-_]/g, ' ')
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .trim();

  // Build tags: provider:* and instance:* carry daemon routing metadata.
  const tags: string[] = [];
  for (const p of m.providers ?? []) tags.push(`provider:${p}`);
  for (const i of m.instances ?? []) tags.push(`instance:${i}`);

  // All models use the 'legionio' provider (openai-compatible) since the
  // daemon's /v1/chat/completions endpoint handles all model types
  // (Anthropic, OpenAI, etc.) in standard OpenAI format.
  return {
    key: m.id,
    displayName,
    provider: 'legionio',
    modelName: m.id,
    ...(m.max_context ? { maxInputTokens: m.max_context } : {}),
    tags,
  };
}

async function syncModelCatalog(api: PluginAPI): Promise<void> {
  const config = getPluginConfig(api);
  if (!config.enabled || !config.daemonUrl) return;

  try {
    const result = await daemonJson(api, '/api/llm/models', { quiet: true });
    if (!result.ok || !result.data) {
      api.log.warn('[legion] Failed to fetch model catalog:', result.error);
      return;
    }

    const raw = result.data as { models?: DaemonModel[] };
    const allModels: DaemonModel[] = raw.models ?? [];
    const chatModels = allModels.filter(isDaemonChatModel);

    if (chatModels.length === 0) {
      api.log.warn('[legion] No chat models returned from daemon');
      return;
    }

    // TODO: haiku models are excluded for now because they route through
    // anthropic/apollo or bedrock/apollo which require the lex-* extension to
    // be loaded on the daemon. Until that's resolved, haiku models would appear
    // in the catalog but fail on every inference call. Uncomment this filter
    // once the lex-* provider registration issue is fixed daemon-side.
    const visibleChatModels = chatModels.filter(
      (m) => !m.id.toLowerCase().includes('haiku'),
    );

    // Sort: vllm models first (they work without lex-* extension), then the rest
    const sortedChatModels = [...visibleChatModels].sort((a, b) => {
      const aIsVllm = (a.providers ?? []).includes('vllm');
      const bIsVllm = (b.providers ?? []).includes('vllm');
      if (aIsVllm !== bIsVllm) return aIsVllm ? -1 : 1;
      return 0;
    });

    const legionEntries = sortedChatModels.map(mapDaemonModelToKaiCatalog);

    // Register the legionio provider pointing at the daemon's /v1 endpoint.
    // The AI SDK appends /chat/completions to this base URL automatically.
    //
    // In 'native' mode, the registered inference provider intercepts all
    // inference before it reaches this endpoint. In 'openai' mode, Mastra
    // uses this provider config directly via the AI SDK.
    //
    // Extra headers with {placeholder} syntax are resolved per-request by
    // Kai's streaming infrastructure.
    const pluginData = (api.config.getPluginData() || {}) as Record<string, unknown>;

    const extraHeaders: Record<string, string> = {
      'X-Legion-Client-Tool-Passthrough': 'true',
      'X-Legion-Conversation-Id': '{conversationId}',
      'X-Legion-Cwd': '{cwd}',
      'X-Legion-Include-Reasoning': 'true',
    };

    // Forward per-conversation routing defaults if configured
    const defaultTier = (pluginData.defaultTier as string) || '';
    const defaultProvider = (pluginData.defaultProvider as string) || '';
    if (defaultTier) extraHeaders['X-Legion-Tier'] = defaultTier;
    if (defaultProvider) extraHeaders['X-Legion-Provider'] = defaultProvider;

    // Forward knowledge config
    if (pluginData.knowledgeRagEnabled === true) extraHeaders['X-Legion-Rag-Enabled'] = 'true';
    if (pluginData.knowledgeCaptureEnabled === true) extraHeaders['X-Legion-Capture-Enabled'] = 'true';

    api.config.set('models.providers.legionio', {
      type: 'openai-compatible',
      endpoint: `${config.daemonUrl}/v1`,
      apiKey: 'legionio-daemon',
      useResponsesApi: false,
      extraHeaders,
    });

    // Merge with existing catalog: strip any previous legion entries, then prepend new ones.
    // This avoids clobbering models registered by other plugins (e.g. llm-gateway).
    const appConfig = api.config.get() as { models?: { catalog?: Array<Record<string, unknown>>; defaultModelKey?: string } } | null;
    const existingCatalog: Array<Record<string, unknown>> = appConfig?.models?.catalog ?? [];
    const withoutLegion = existingCatalog.filter(
      (m) => typeof m.provider !== 'string' || !m.provider.startsWith('legionio'),
    );
    const mergedCatalog = [...legionEntries, ...withoutLegion];
    api.config.set('models.catalog', mergedCatalog);

    // Default to the first legion model if no default is set (or current default is unknown)
    const currentDefault = appConfig?.models?.defaultModelKey;
    const allKeys = new Set(mergedCatalog.map((m) => m.key));
    if (!currentDefault || !allKeys.has(currentDefault)) {
      api.config.set('models.defaultModelKey', legionEntries[0].key);
    }

    api.log.info(`[legion] Model catalog synced: ${legionEntries.length} legion models (${mergedCatalog.length} total)`);
  } catch (err) {
    api.log.warn('[legion] Model catalog sync error:', err);
  }
}

// ── Runtime contribution ──────────────────────────────────────────────────────

function ensureRuntimeRegistration(api: PluginAPI, config: PluginConfig): void {
  if (config.enabled) {
    api.agent.registerRuntime({
      id: 'legion',
      name: 'LegionIO',
      description: 'LegionIO daemon runtime. Routes all inference through the local LegionIO daemon with automatic model selection, memory, and tool support. Falls back to Kai\'s built-in pipeline when the daemon is offline.',
      isAvailable: () => isDaemonOnline(),
    });
  } else {
    api.agent.unregisterRuntime('legion');
  }
}

// ── Inference provider registration ──────────────────────────────────────────

function ensureBackendRegistration(api: PluginAPI, config: PluginConfig): void {
  const shouldRegister = Boolean(config.enabled && config.daemonUrl && config.apiEndpoint === 'native');

  if (shouldRegister && !backendRegistered) {
    api.agent.registerInferenceProvider({
      name: 'LegionIO',
      isAvailable: () => isDaemonOnline(),
      stream: (options: Parameters<typeof streamDaemonInference>[0]) =>
        streamDaemonInference(options),
    });
    backendRegistered = true;
    api.config.set('agent.runtime', 'legion');
    return;
  }

  if (!shouldRegister && backendRegistered) {
    api.agent.unregisterInferenceProvider();
    backendRegistered = false;
    api.config.set('agent.runtime', 'auto');
  }
}

// ── Health polling ────────────────────────────────────────────────────────────

async function checkHealth(api: PluginAPI): Promise<void> {
  const config = getPluginConfig(api);
  if (!config.enabled || !config.daemonUrl) return;

  const result = await daemonJson(api, config.readyPath, { quiet: true, timeoutMs: 5_000 });
  const isOnline = result.ok;
  const wasOffline = !isDaemonOnline();
  markDaemonReachable(isOnline);

  api.state.replace({
    status: isOnline ? 'online' : 'offline',
    lastCheckedAt: new Date().toISOString(),
    lastError: result.error || null,
  });

  updateBanner(api, isOnline);

  // Sync model catalog when daemon comes online (or on first online check)
  if (isOnline && wasOffline) {
    void syncModelCatalog(api);
    // Set Legion as the active runtime so all inference routes through the
    // daemon out of the box. The daemon handles model routing internally,
    // so this is safe even for models from other providers.
    api.config.set('agent.runtime', 'legion');
  }
}

function scheduleHealthPoll(api: PluginAPI): void {
  clearHealthPoll();
  const config = getPluginConfig(api);
  if (!config.enabled) return;

  healthPollTimer = setInterval(() => {
    void checkHealth(api);
  }, HEALTH_POLL_MS);
}

function clearHealthPoll(): void {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }
}

// ── Banner ────────────────────────────────────────────────────────────────────

function updateBanner(api: PluginAPI, isOnline: boolean): void {
  const config = getPluginConfig(api);
  if (!config.enabled) {
    api.ui.hideBanner(BANNER_ID);
    return;
  }

  api.ui.showBanner({
    id: BANNER_ID,
    text: isOnline ? 'LegionIO  ●  Available' : 'LegionIO  ●  Unavailable',
    variant: isOnline ? 'success' : 'warning',
    dismissible: false,
  });
}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

export async function activate(api: PluginAPI): Promise<void> {
  currentApi = api;
  api.log.info('Activating LegionIO plugin');

  // Wire up config provider before any daemon requests so daemon-client
  // can resolve config without a circular dynamic import.
  setConfigProvider(getPluginConfig);
  setInferenceApi(api);

  api.ui.registerSettingsView({
    id: 'legion',
    label: 'LegionIO',
  });

  const config = getPluginConfig(api);
  ensureBackendRegistration(api, config);
  ensureRuntimeRegistration(api, config);
  registerTool(api);

  // Register the legionio CLI tool so agents can call it
  api.agent.registerCliTool({
    name: 'legionio',
    binary: 'legionio',
    description: 'LegionIO daemon API. Actions: status, query, ingest, workers, tasks, extensions, execute, config, memory, request.',
  });

  // Initial health check + banner + model catalog sync
  await checkHealth(api);
  // If daemon was already online on first check, sync catalog now
  if (isDaemonOnline()) {
    void syncModelCatalog(api);
  }
  scheduleHealthPoll(api);

  // Handle actions from the settings UI
  api.onAction('settings:legion', async (action: string, data?: Record<string, unknown>) => {
    if (action === 'set-config') {
      const { key, value } = data || {};
      if (typeof key === 'string') {
        api.config.setPluginData(key, value);
      }
    }
    if (action === 'refresh-status') {
      await checkHealth(api);
    }
  });

  // Re-register provider and restart poll on config changes.
  // Also re-merge the model catalog in case another plugin (e.g. llm-gateway) overwrote it.
  api.config.onChanged(() => {
    const updated = getPluginConfig(api);
    ensureBackendRegistration(api, updated);
    ensureRuntimeRegistration(api, updated);
    scheduleHealthPoll(api);
    void checkHealth(api);
    if (isDaemonOnline()) {
      void syncModelCatalog(api);
    }
  });
}

export async function deactivate(): Promise<void> {
  clearHealthPoll();
  setInferenceApi(null);
  if (backendRegistered && currentApi) {
    currentApi.agent.unregisterInferenceProvider();
    backendRegistered = false;
  }
  if (currentApi) {
    currentApi.agent.unregisterRuntime('legion');
  }
  currentApi = null;
}
