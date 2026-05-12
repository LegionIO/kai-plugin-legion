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
  markDaemonReachable(isOnline);

  api.state.replace({
    status: isOnline ? 'online' : 'offline',
    lastCheckedAt: new Date().toISOString(),
    lastError: result.error || null,
  });

  updateBanner(api, isOnline);
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

  // Initial health check + banner
  await checkHealth(api);
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
