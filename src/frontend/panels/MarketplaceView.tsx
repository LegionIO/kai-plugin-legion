/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, SegmentTabs, JsonBox, EmptyState } from '../components/index.js';

export function MarketplaceView({ onAction }: any): any {
  const [tab, setTab] = useState('browse');
  const [available, setAvailable] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAvailable = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/extensions/available', quiet: true }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load marketplace listings.');
        setAvailable([]);
      } else {
        setAvailable(asArray(result?.data));
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  };

  const loadInstalled = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/extensions', quiet: true }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load installed extensions.');
        setInstalled([]);
      } else {
        setInstalled(asArray(result?.data));
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setInstalled([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'browse' && available.length === 0) {
      void loadAvailable();
    }
    if (tab === 'installed' && installed.length === 0) {
      void loadInstalled();
    }
  }, [tab]);

  const refresh = () => {
    if (tab === 'browse') {
      void loadAvailable();
    } else {
      void loadInstalled();
    }
  };

  const mutate = async (path: string, id: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path: path.replace(':id', encodeURIComponent(id)),
        method: 'POST',
        body: {},
        refreshRuntime: true,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Extension operation failed.');
      }
    } finally {
      setLoading(false);
      refresh();
    }
  };

  const loadConfig = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path: `/api/extensions/${encodeURIComponent(id)}/config`,
        quiet: true,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load extension config.');
        setSelectedConfig(null);
      } else {
        setSelectedConfig(result?.data || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const list = tab === 'browse' ? available : installed;

  return (
    <div className="space-y-5">
      <Section
        title="Extension Marketplace"
        subtitle="Browse daemon extension listings and manage installed packages."
        actions={[
          <ActionButton key="refresh" label={loading ? 'Refreshing...' : 'Refresh'} onClick={refresh} disabled={loading} variant="secondary" />,
        ]}
      >
        <SegmentTabs
          tabs={[
            { key: 'browse', label: 'Browse' },
            { key: 'installed', label: 'Installed' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Section>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      {list.length === 0 && !loading ? (
        <EmptyState
          title={tab === 'browse' ? 'No marketplace listings' : 'No installed extensions'}
          body={tab === 'browse' ? 'Refresh to load available daemon extensions.' : 'No installed daemon extensions were returned.'}
        />
      ) : null}
      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((entry: any, index: number) => {
            const id = entry?.id || entry?.name || `extension-${index}`;
            const title = entry?.display_name || entry?.displayName || entry?.name || entry?.id || id;
            const description = entry?.description || entry?.summary || '';
            const enabled = entry?.enabled;
            return (
              <div key={id} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium break-all">{title}</div>
                    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {entry?.version ? <span>{`v${entry.version}`}</span> : null}
                      {entry?.category ? <span>{entry.category}</span> : null}
                      {tab === 'installed' && enabled != null ? <Badge status={enabled ? 'success' : 'warning'} /> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tab === 'browse' ? (
                      <ActionButton label="Install" onClick={() => { void mutate('/api/extensions/:id/install', id); }} disabled={loading} />
                    ) : null}
                    {tab === 'installed' ? (
                      <ActionButton label={enabled === false ? 'Enable' : 'Disable'} onClick={() => { void mutate(enabled === false ? '/api/extensions/:id/enable' : '/api/extensions/:id/disable', id); }} disabled={loading} variant="secondary" />
                    ) : null}
                    {tab === 'installed' ? (
                      <ActionButton label="Config" onClick={() => { void loadConfig(id); }} disabled={loading} variant="secondary" />
                    ) : null}
                    {tab === 'installed' ? (
                      <ActionButton label="Uninstall" onClick={() => { void mutate('/api/extensions/:id/uninstall', id); }} disabled={loading} variant="danger" />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <Section
        title="Selected Extension Config"
        subtitle="A raw config payload from `/api/extensions/:id/config` for the most recently selected installed extension."
      >
        <JsonBox value={selectedConfig} emptyLabel="Select an installed extension and load its config to inspect it here." />
      </Section>
    </div>
  );
}
