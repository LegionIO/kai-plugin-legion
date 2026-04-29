/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function WorkersTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('workers-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const lifecycle = async (id: string, action: string) => {
    await Promise.resolve(onAction?.('worker-lifecycle', { id, action }));
    void load();
  };

  const items = asArray(data);

  return (
    <Section
      title="Workers"
      subtitle={`${items.length} registered`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : items.length === 0 ? (
        <EmptyState title="No workers" body="No workers are currently registered." />
      ) : (
        <div className="grid gap-2">
          {items.map((w: any, i: number) => (
            <div key={w.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <div>
                <span className="text-sm font-medium">{w.name || w.id}</span>
                <span className="ml-2"><Badge status={w.health || w.status || 'unknown'} /></span>
                {w.lastSeen && <span className="ml-2 text-xs text-muted-foreground">seen {fmtAgo(w.lastSeen)}</span>}
              </div>
              <div className="flex gap-2">
                <ActionButton label="Pause" onClick={() => lifecycle(w.id, 'pause')} variant="secondary" />
                <ActionButton label="Resume" onClick={() => lifecycle(w.id, 'resume')} variant="secondary" />
                <ActionButton label="Retire" onClick={() => lifecycle(w.id, 'retire')} variant="danger" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
