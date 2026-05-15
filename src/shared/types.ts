/**
 * Type definitions for the Legion plugin.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginAPI = any;

/**
 * User-configurable fields (enabled, daemonUrl) plus internal defaults
 * used by daemon-client.ts and daemon-inference.ts.
 */
export type PluginConfig = {
  enabled: boolean;
  daemonUrl: string;
  // Internal defaults — not user-configurable, not in configSchema
  apiKey: string;
  configDir: string;
  readyPath: string;
  healthPath: string;
  streamPath: string;
  backendEnabled: boolean;
};

export type PluginState = {
  status: 'online' | 'offline' | 'disabled' | 'unconfigured';
  lastCheckedAt: string | null;
  lastError: string | null;
};

export type DaemonResult<T = unknown> = {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T | null;
};
