/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Section, ActionButton, EmptyState } from '../components/index.js';

export function MetricsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('metrics'));
      if (result?.ok === false) { setError(result.error || 'Failed'); return; }
      const text = typeof result === 'string' ? result : typeof result?.data === 'string' ? result.data : JSON.stringify(result?.data ?? result, null, 2);
      setData(text);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return (
    <Section
      title="Metrics"
      subtitle="Raw Prometheus metrics"
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : !data ? (
        <EmptyState title="No metrics" body="No Prometheus metrics returned." />
      ) : (
        <pre className="max-h-[520px] overflow-auto rounded-2xl border border-border/60 bg-background/55 p-4 text-xs text-foreground/90 whitespace-pre-wrap">{data}</pre>
      )}
    </Section>
  );
}
