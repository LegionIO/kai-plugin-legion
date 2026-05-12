/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from 'react';
import { cx } from '../lib/utils.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type InstanceInfo = {
  health?: string;
  capabilities?: string[];
  models?: Array<{ id: string; [key: string]: unknown } | string>;
  [key: string]: unknown;
};

type ProviderInfo = {
  instances?: Record<string, InstanceInfo>;
  [key: string]: unknown;
};

type TierInfo = {
  available?: boolean;
  providers?: Record<string, ProviderInfo>;
  [key: string]: unknown;
};

type TiersData = {
  tiers?: Record<string, TierInfo>;
  priority?: string[];
  privacy_mode?: boolean;
};

type RoutingModalProps = {
  pluginName: string;
  props: Record<string, unknown>;
  onAction: (action: string, data?: unknown) => Promise<unknown>;
  pluginConfig: Record<string, unknown>;
  pluginState: Record<string, unknown>;
  config?: unknown;
  updateConfig?: (path: string, value: unknown) => void;
  onClose?: () => void;
  setPluginConfig?: (path: string, value: unknown) => Promise<void>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthDot(health: string | undefined): any {
  const color =
    health === 'closed'
      ? 'bg-emerald-500'
      : health === 'half_open'
        ? 'bg-amber-400'
        : health === 'open'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40';
  return (
    <span
      title={health || 'unknown'}
      className={cx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', color)}
    />
  );
}

function getProviderHealth(
  tiersData: TiersData | null,
  tierKey: string,
  providerKey: string,
): string | undefined {
  const instances =
    tiersData?.tiers?.[tierKey]?.providers?.[providerKey]?.instances ?? {};
  const healths = Object.values(instances).map((i) => i.health);
  if (healths.includes('closed')) return 'closed';
  if (healths.includes('half_open')) return 'half_open';
  if (healths.includes('open')) return 'open';
  return healths[0] as string | undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RoutingModal({
  onAction,
  pluginConfig,
  pluginState,
  onClose,
}: RoutingModalProps): any {
  const tiersData = (pluginState.tiers as TiersData) || null;

  const [tier, setTier] = useState<string>((pluginConfig.defaultTier as string) || '');
  const [provider, setProvider] = useState<string>((pluginConfig.defaultProvider as string) || '');
  const [model, setModel] = useState<string>((pluginConfig.defaultModel as string) || '');
  const [saving, setSaving] = useState(false);

  // Derived tier options — only available ones
  const tierOptions = useMemo(() => {
    const tiers = tiersData?.tiers ?? {};
    return Object.entries(tiers)
      .filter(([, info]) => info.available === true)
      .map(([key]) => key);
  }, [tiersData]);

  // Derived provider options — filtered by selected tier (or all if auto)
  const providerOptions = useMemo(() => {
    const tiers = tiersData?.tiers ?? {};
    if (tier) {
      return Object.keys(tiers[tier]?.providers ?? {});
    }
    // All providers across all available tiers
    const all = new Set<string>();
    for (const [key, info] of Object.entries(tiers)) {
      if (info.available) {
        for (const p of Object.keys(info.providers ?? {})) all.add(p);
      }
    }
    return Array.from(all);
  }, [tiersData, tier]);

  // Derived model options — filtered by tier+provider
  const modelOptions = useMemo(() => {
    const tiers = tiersData?.tiers ?? {};
    const models = new Map<string, boolean>();

    const collectModels = (instances: Record<string, InstanceInfo> | undefined) => {
      for (const inst of Object.values(instances ?? {})) {
        for (const m of inst.models ?? []) {
          const id = typeof m === 'string' ? m : m.id;
          if (id) models.set(id, true);
        }
      }
    };

    if (tier && provider) {
      collectModels(tiers[tier]?.providers?.[provider]?.instances);
    } else if (tier) {
      for (const pInfo of Object.values(tiers[tier]?.providers ?? {})) {
        collectModels(pInfo.instances);
      }
    } else if (provider) {
      for (const tInfo of Object.values(tiers)) {
        if (tInfo.available) {
          collectModels(tInfo.providers?.[provider]?.instances);
        }
      }
    } else {
      for (const tInfo of Object.values(tiers)) {
        if (tInfo.available) {
          for (const pInfo of Object.values(tInfo.providers ?? {})) {
            collectModels(pInfo.instances);
          }
        }
      }
    }

    return Array.from(models.keys());
  }, [tiersData, tier, provider]);

  const handleTierChange = (v: string) => {
    setTier(v);
    setProvider('');
    setModel('');
  };

  const handleProviderChange = (v: string) => {
    setProvider(v);
    setModel('');
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      await onAction('save-routing', { tier, provider, model });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      setTier('');
      setProvider('');
      setModel('');
      await onAction('save-routing', { tier: '', provider: '', model: '' });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    'w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60';

  const labelClass =
    'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground';

  return (
    <div className="grid gap-4 p-1">
      {/* Tier */}
      <label className="grid gap-1.5">
        <span className={labelClass}>Tier</span>
        <select
          value={tier}
          onChange={(e: any) => handleTierChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Auto</option>
          {tierOptions.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>

      {/* Provider */}
      <label className="grid gap-1.5">
        <span className={labelClass}>Provider</span>
        <select
          value={provider}
          onChange={(e: any) => handleProviderChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Auto</option>
          {providerOptions.map((p) => {
            const health = tiersData
              ? getProviderHealth(tiersData, tier, p)
              : undefined;
            const dot =
              health === 'closed'
                ? ' ●'
                : health === 'half_open'
                  ? ' ◑'
                  : health === 'open'
                    ? ' ○'
                    : '';
            return (
              <option key={p} value={p}>
                {p}{dot}
              </option>
            );
          })}
        </select>
        {/* Health legend dots for providers (visible outside select for color) */}
        {providerOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-0.5">
            {providerOptions.map((p) => {
              const health = tiersData
                ? getProviderHealth(tiersData, tier, p)
                : undefined;
              return (
                <span key={p} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {healthDot(health)}
                  {p}
                </span>
              );
            })}
          </div>
        )}
      </label>

      {/* Model */}
      <label className="grid gap-1.5">
        <span className={labelClass}>Model</span>
        <select
          value={model}
          onChange={(e: any) => setModel(e.target.value)}
          className={selectClass}
        >
          <option value="">Auto</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleApply()}
          className={cx(
            'flex-1 rounded-2xl px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            saving && 'cursor-not-allowed opacity-60',
          )}
        >
          {saving ? 'Saving...' : 'Apply'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleReset()}
          className={cx(
            'rounded-2xl border border-border/70 bg-card/40 px-4 py-2 text-sm font-medium',
            'text-muted-foreground transition-colors hover:text-foreground',
            saving && 'cursor-not-allowed opacity-60',
          )}
        >
          Reset to Auto
        </button>
      </div>
    </div>
  );
}
