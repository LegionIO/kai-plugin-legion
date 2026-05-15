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
export function getPluginConfig(api: PluginAPI): PluginConfig {
  const data = (api.config.getPluginData() || {}) as Record<string, unknown>;
  return {
    enabled: data.enabled !== false,
    daemonUrl: (data.daemonUrl as string) || 'http://127.0.0.1:4567',
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
  max_context?: number | null;
  enabled?: boolean;
};

const NON_CHAT_SIGNALS = [
  'embed', 'embedding', 'embeddings',
  'speech-to-text', 'text-to-speech', 'speech', 'tts', 'stt',
  'realtime', 'image', 'video', 'transcription', 'transcribe',
];

function isDaemonChatModel(m: DaemonModel): boolean {
  if (!m.id || m.enabled === false) return false;
  if (!m.types?.includes('inference')) return false;
  const signals = [m.id, ...(m.capabilities ?? [])].map((s) => s.toLowerCase());
  return !signals.some((s) => NON_CHAT_SIGNALS.some((bad) => s.includes(bad)));
}

function mapDaemonModelToKaiCatalog(m: DaemonModel): Record<string, unknown> {
  const families = (m.model_families ?? []).map((f) => f.toLowerCase());
  const isAnthropic = families.includes('anthropic') || m.id.startsWith('claude') || m.id.startsWith('anthropic.');
  const provider = isAnthropic ? 'legionio_anthropic' : 'legionio';

  // Derive a human-readable display name from the id
  const displayName = m.id
    .replace(/[-_]/g, ' ')
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .trim();

  return {
    key: m.id,
    displayName,
    provider,
    modelName: m.id,
    ...(m.max_context ? { maxInputTokens: m.max_context } : {}),
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

    const catalog = chatModels.map(mapDaemonModelToKaiCatalog);

    // Register the legionio provider (pass-through — all routing handled by daemon)
    api.config.set('models.providers.legionio', {
      type: 'legionio',
      endpoint: config.daemonUrl,
    });
    api.config.set('models.providers.legionio_anthropic', {
      type: 'legionio',
      endpoint: config.daemonUrl,
    });

    api.config.set('models.catalog', catalog);

    // Default to the first model if not already set
    const appConfig = api.config.get() as { models?: { defaultModelKey?: string } } | null;
    const currentDefault = appConfig?.models?.defaultModelKey;
    if (!currentDefault || !catalog.find((m) => m.key === currentDefault)) {
      api.config.set('models.defaultModelKey', catalog[0].key);
    }

    api.log.info(`[legion] Model catalog synced: ${catalog.length} chat models`);
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
      isAvailable: () => isDaemonOnline(),
    });
  } else {
    api.agent.unregisterRuntime('legion');
  }
}

// ── Inference provider registration ──────────────────────────────────────────

function ensureBackendRegistration(api: PluginAPI, config: PluginConfig): void {
  const shouldRegister = Boolean(config.enabled && config.daemonUrl);

  if (shouldRegister && !backendRegistered) {
    api.agent.registerInferenceProvider({
      name: 'LegionIO',
      isAvailable: () => isDaemonOnline(),
      stream: (options: Parameters<typeof streamDaemonInference>[0]) =>
        streamDaemonInference(options),
    });
    backendRegistered = true;
    return;
  }

  if (!shouldRegister && backendRegistered) {
    api.agent.unregisterInferenceProvider();
    backendRegistered = false;
  }
}

// ── Health polling ────────────────────────────────────────────────────────────

async function checkHealth(api: PluginAPI): Promise<void> {
  const config = getPluginConfig(api);
  if (!config.enabled || !config.daemonUrl) return;

  const result = await daemonJson(api, config.readyPath, { quiet: true });
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
  });

  // Re-register provider and restart poll on config changes
  api.config.onChanged(() => {
    const updated = getPluginConfig(api);
    ensureBackendRegistration(api, updated);
    ensureRuntimeRegistration(api, updated);
    scheduleHealthPoll(api);
    void checkHealth(api);
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
