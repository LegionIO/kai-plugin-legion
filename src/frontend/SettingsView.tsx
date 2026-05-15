import React, { useState, useCallback } from 'react';
import type { PluginComponentProps } from './hooks';
import { getHostBridge } from './utils';

type LegionConfig = {
  enabled?: boolean;
  daemonUrl?: string;
};

type LegionState = {
  status?: 'online' | 'offline' | 'disabled' | 'unconfigured';
  lastCheckedAt?: string | null;
  lastError?: string | null;
};

export function SettingsView({
  pluginName,
  pluginConfig,
  pluginState,
  onAction,
}: PluginComponentProps<LegionState, LegionConfig>) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const invoke = useCallback(
    (action: string, data?: unknown) => {
      const bridge = getHostBridge()?.plugins;
      if (bridge?.action) {
        return bridge.action(pluginName, 'settings:legion', action, data);
      }
      return onAction ? onAction(action, data) : null;
    },
    [pluginName, onAction],
  );

  // Config comes in as props — Kai injects these directly
  const cfg = (pluginConfig ?? {}) as Record<string, unknown>;
  const enabled: boolean = cfg.enabled !== false;
  const daemonUrl: string = (cfg.daemonUrl as string) || 'http://127.0.0.1:4567';

  // State comes in as props — published by backend via api.state.replace()
  const status = pluginState?.status ?? 'unknown';
  const lastCheckedAt = pluginState?.lastCheckedAt ?? null;

  const isOnline = status === 'online';
  const isOffline = status === 'offline';

  const statusLabel = isOnline
    ? 'Available'
    : isOffline
      ? 'Offline'
      : status === 'disabled'
        ? 'Disabled'
        : 'Checking…';

  const statusColor = isOnline
    ? 'text-green-700 dark:text-green-400'
    : isOffline
      ? 'text-red-500 dark:text-red-400'
      : 'text-muted-foreground';

  const statusBorder = isOnline
    ? 'bg-green-500/5 border-green-500/20'
    : isOffline
      ? 'bg-red-500/5 border-red-500/20'
      : 'bg-muted/30 border-border/60';

  const dotColor = isOnline
    ? 'bg-green-500'
    : isOffline
      ? 'bg-red-500'
      : 'bg-yellow-500';

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
        <legend className="px-1 text-[10px] font-medium text-muted-foreground">
          LegionIO Runtime
        </legend>

        <p className="text-xs text-muted-foreground">
          When enabled and the daemon is online, all LLM inference routes through LegionIO — including tool calls, compaction, and memory.
        </p>

        {/* Enable toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={enabled}
            onChange={(e) => {
              void invoke('set-config', { key: 'enabled', value: e.target.checked });
            }}
          />
          <span className="text-xs">Enable LegionIO as preferred runtime</span>
        </label>

        {/* Daemon URL */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Daemon URL
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-border/70 bg-card/80 px-2.5 py-1.5 text-xs font-mono focus:ring-1 focus:ring-ring outline-none"
            value={localUrl ?? daemonUrl}
            placeholder="http://127.0.0.1:4567"
            onChange={(e) => setLocalUrl(e.target.value)}
            onBlur={() => {
              if (localUrl != null && localUrl !== daemonUrl) {
                void invoke('set-config', { key: 'daemonUrl', value: localUrl });
              }
              setLocalUrl(null);
            }}
          />
        </div>

        {/* Status card */}
        <div className={`rounded-lg border p-3 space-y-1.5 ${statusBorder}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
            <span className={`text-xs font-medium ${statusColor}`}>
              {statusLabel}
            </span>
            {lastCheckedAt && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date(lastCheckedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
