import type { PluginAPI, PluginConfig } from '../shared/types.js';
import { isDaemonOnline, streamDaemonInference } from './daemon-inference.js';

/* ── Module-scoped registration flag ── */

let backendRegistered = false;

/* ── Backend registration / unregistration ── */

/**
 * Register or unregister the Legion daemon as the primary inference provider.
 * When registered and the daemon is online, all LLM inference routes through
 * the daemon's /api/llm/inference endpoint. When offline, Kai's standard
 * Mastra pipeline takes over automatically.
 */
export function ensureBackendRegistration(api: PluginAPI, config: PluginConfig): void {
  const shouldRegister = Boolean(
    config.enabled && config.backendEnabled && config.daemonUrl,
  );

  if (shouldRegister && !backendRegistered) {
    api.agent.registerInferenceProvider({
      name: 'legion-daemon',
      isAvailable: () => isDaemonOnline(),
      stream: (options) => streamDaemonInference(options),
    });
    backendRegistered = true;
    return;
  }

  if (!shouldRegister && backendRegistered) {
    api.agent.unregisterInferenceProvider();
    backendRegistered = false;
  }
}
