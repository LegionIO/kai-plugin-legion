/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, KeyValueGrid } from '../components/index.js';

export function TopologyTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [exchanges, setExchanges] = useState<any>(null);
  const [queues, setQueues] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, e, q] = await Promise.all([
        Promise.resolve(onAction?.('transport-status')),
        Promise.resolve(onAction?.('transport-exchanges')),
        Promise.resolve(onAction?.('transport-queues')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed'); return; }
      setStatus(s?.data ?? s);
      setExchanges(e?.data ?? e);
      setQueues(q?.data ?? q);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const exchList = asArray(exchanges);
  const queueList = asArray(queues);

  return (
    <Section
      title="Topology"
      subtitle="Transport status, exchanges, and queues"
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          {status && (
            <KeyValueGrid items={[
              ['Transport', status.type || status.transport || 'n/a'],
              ['Status', status.status || status.state || 'unknown'],
              ['Connections', String(status.connections ?? 'n/a')],
            ]} />
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exchanges</h4>
          {exchList.length === 0 ? (
            <EmptyState title="No exchanges" body="No exchanges found." />
          ) : (
            <div className="grid gap-2">
              {exchList.map((e: any, i: number) => (
                <div key={e.name || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-2">
                  <span className="text-sm font-medium">{e.name || e.id}</span>
                  <Badge status={e.type || 'info'} />
                </div>
              ))}
            </div>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Queues</h4>
          {queueList.length === 0 ? (
            <EmptyState title="No queues" body="No queues found." />
          ) : (
            <div className="grid gap-2">
              {queueList.map((q: any, i: number) => (
                <div key={q.name || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-2">
                  <div>
                    <span className="text-sm font-medium">{q.name || q.id}</span>
                    {q.depth != null && <span className="ml-2 text-xs text-muted-foreground">depth: {q.depth}</span>}
                  </div>
                  <Badge status={q.state || 'info'} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
