/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { cx } from '../lib/utils.js';

type RoutingBannerProps = {
  pluginName: string;
  props: Record<string, unknown>;
  onAction: (action: string, data?: unknown) => Promise<unknown>;
  pluginConfig: Record<string, unknown>;
  pluginState: Record<string, unknown>;
  config?: unknown;
  updateConfig?: (path: string, value: unknown) => void;
};

export function RoutingBanner({
  onAction,
  pluginConfig,
}: RoutingBannerProps): any {
  const tier = (pluginConfig.defaultTier as string) || '';
  const provider = (pluginConfig.defaultProvider as string) || '';
  const model = (pluginConfig.defaultModel as string) || '';

  const isAuto = !tier && !provider && !model;

  const label = isAuto
    ? 'Auto Routing'
    : [tier || 'Auto', provider || 'Auto', model || 'Auto'].join(' › ');

  const handleClick = () => {
    void onAction('open-routing-modal');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
        'border-b border-border/50 bg-card/40',
        'hover:bg-card/70 hover:text-foreground',
        'text-muted-foreground',
      )}
    >
      <span
        className={cx(
          'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
          isAuto ? 'bg-primary/60' : 'bg-emerald-500',
        )}
      />
      <span className="font-medium">LLM:</span>
      <span className="truncate">{label}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="ml-auto h-3 w-3 shrink-0 opacity-50"
      >
        <path
          fillRule="evenodd"
          d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
