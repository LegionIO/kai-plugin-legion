/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function TenantsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('tenants-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const items = asArray(data);

  return (
    <Section
      title="Tenants"
      subtitle={`${items.length} tenants`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : items.length === 0 ? (
        <EmptyState title="No tenants" body="No tenants registered." />
      ) : (
        <div className="grid gap-2">
          {items.map((t: any, i: number) => (
            <div key={t.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <div>
                <span className="text-sm font-medium">{t.name || t.id}</span>
                {t.plan && <span className="ml-2 text-xs text-muted-foreground">{t.plan}</span>}
                {t.createdAt && <span className="ml-2 text-xs text-muted-foreground">{fmtAgo(t.createdAt)}</span>}
              </div>
              <Badge status={t.status || (t.active !== false ? 'online' : 'disabled')} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
