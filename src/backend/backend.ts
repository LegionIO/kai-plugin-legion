import type { PluginAPI, PluginConfig } from '../shared/types.js';
import { BACKEND_KEY } from '../shared/constants.js';

/* ── Module-scoped registration flag ── */

let backendRegistered = false;

/* ── Public accessors ── */

export function setBackendRegistered(val: boolean): void {
  backendRegistered = val;
}

/* ── Backend registration / unregistration ── */

/**
 * Evaluate whether the backend should be considered "registered" based on
 * config flags. The Kai desktop plugin API does not currently expose
 * `agent.registerBackend` / `agent.unregisterBackend`, so this function
 * only tracks the logical state and emits events for internal bookkeeping.
 */
export function ensureBackendRegistration(api: PluginAPI, config: PluginConfig): void {
  const shouldRegister = Boolean(
    config.enabled && config.backendEnabled && config.daemonUrl,
  );

  if (shouldRegister && !backendRegistered) {
    backendRegistered = true;
    api.state.emitEvent('backend-registered', { key: BACKEND_KEY });
    return;
  }

  if (!shouldRegister && backendRegistered) {
    backendRegistered = false;
    api.state.emitEvent('backend-unregistered', { key: BACKEND_KEY });
  }
}
