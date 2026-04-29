/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, EmptyState, JsonBox } from '../components/index.js';

export function PromptsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(''); setRunResult(null);
    try {
      const result = await Promise.resolve(onAction?.('prompts-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const run = async (id: string) => {
    setRunning(id); setRunResult(null);
    try {
      const result = await Promise.resolve(onAction?.('prompt-run', { id }));
      setRunResult(result?.data ?? result);
    } catch (e: any) { setRunResult({ error: e?.message || String(e) }); }
    finally { setRunning(null); }
  };

  const items = asArray(data);

  return (
    <Section
      title="Prompts"
      subtitle={`${items.length} prompts`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-3">
          {items.length === 0 ? (
            <EmptyState title="No prompts" body="No prompts registered." />
          ) : (
            <div className="grid gap-2">
              {items.map((p: any, i: number) => (
                <div key={p.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name || p.id}</div>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  </div>
                  <ActionButton label={running === p.id ? 'Running...' : 'Run'} onClick={() => run(p.id)} disabled={running != null} />
                </div>
              ))}
            </div>
          )}
          {runResult && (
            <div className="mt-2">
              <JsonBox value={runResult} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
