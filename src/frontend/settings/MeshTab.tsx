/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, KeyValueGrid } from '../components/index.js';

export function MeshTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [peers, setPeers] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, p] = await Promise.all([
        Promise.resolve(onAction?.('mesh-status')),
        Promise.resolve(onAction?.('mesh-peers')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed'); return; }
      setStatus(s?.data ?? s);
      setPeers(p?.data ?? p);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const peerList = asArray(peers);

  return (
    <Section
      title="Mesh"
      subtitle="Mesh network status and peers"
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
              ['Node ID', status.nodeId || status.id || 'n/a'],
              ['Status', status.status || status.state || 'unknown'],
              ['Peers', String(peerList.length)],
            ]} />
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Peers</h4>
          {peerList.length === 0 ? (
            <EmptyState title="No peers" body="No mesh peers connected." />
          ) : (
            <div className="grid gap-2">
              {peerList.map((p: any, i: number) => (
                <div key={p.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{p.name || p.id || p.address}</span>
                    {p.lastSeen && <span className="ml-2 text-xs text-muted-foreground">seen {fmtAgo(p.lastSeen)}</span>}
                  </div>
                  <Badge status={p.status || p.state || 'online'} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
