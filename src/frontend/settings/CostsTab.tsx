/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray, fmtCurrency, fmtNumber } from '../lib/utils.js';
import { Section, ActionButton, StatCard, EmptyState } from '../components/index.js';

export function CostsTab({ onAction }: { onAction: any }) {
  const [metering, setMetering] = useState<any>(null);
  const [byModel, setByModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [m, b] = await Promise.all([
        Promise.resolve(onAction?.('metering')),
        Promise.resolve(onAction?.('metering-by-model')),
      ]);
      if (m?.ok === false) { setError(m.error || 'Failed'); return; }
      setMetering(m?.data ?? m);
      setByModel(b?.data ?? b);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const models = asArray(byModel);

  return (
    <Section
      title="Costs"
      subtitle="Metering and cost breakdown by model"
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          {metering && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total Cost" value={fmtCurrency(metering.totalCost ?? metering.cost)} />
              <StatCard label="Tokens" value={fmtNumber(metering.totalTokens ?? metering.tokens)} />
              <StatCard label="Requests" value={fmtNumber(metering.totalRequests ?? metering.requests)} />
            </div>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Model</h4>
          {models.length === 0 ? (
            <EmptyState title="No breakdown" body="No per-model metering data." />
          ) : (
            <div className="grid gap-2">
              {models.map((m: any, i: number) => (
                <div key={m.model || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{m.model || m.name || `Model ${i + 1}`}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{fmtNumber(m.tokens)} tokens</span>
                  </div>
                  <span className="text-sm font-semibold">{fmtCurrency(m.cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
