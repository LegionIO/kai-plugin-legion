/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fmtNumber } from '../lib/utils.js';
import { Section, ActionButton, StatCard, KeyValueGrid, JsonBox } from '../components/index.js';

export function CapacityTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, f] = await Promise.all([
        Promise.resolve(onAction?.('capacity-status')),
        Promise.resolve(onAction?.('capacity-forecast')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed'); return; }
      setStatus(s?.data ?? s);
      setForecast(f?.data ?? f);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return (
    <Section
      title="Capacity"
      subtitle="Resource capacity and forecast"
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          {status && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Workers" value={fmtNumber(status.workers ?? status.totalWorkers)} />
              <StatCard label="Active" value={fmtNumber(status.active ?? status.activeWorkers)} />
              <StatCard label="Utilization" value={`${Math.round((status.utilization ?? 0) * 100)}%`} />
              <StatCard label="Queue Depth" value={fmtNumber(status.queueDepth ?? status.pending ?? 0)} />
            </div>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Forecast</h4>
          {forecast ? <JsonBox value={forecast} /> : <p className="text-sm text-muted-foreground">No forecast data.</p>}
        </div>
      )}
    </Section>
  );
}
