/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, Field } from '../components/index.js';

export function WebhooksTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEvent, setNewEvent] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('webhooks-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newUrl.trim()) return;
    await Promise.resolve(onAction?.('webhook-create', { url: newUrl, event: newEvent || undefined }));
    setNewUrl(''); setNewEvent('');
    void load();
  };

  const remove = async (id: string) => {
    await Promise.resolve(onAction?.('webhook-delete', { id }));
    void load();
  };

  const items = asArray(data);

  return (
    <Section
      title="Webhooks"
      subtitle={`${items.length} webhooks`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-end gap-2">
            <Field label="URL" value={newUrl} onChange={setNewUrl} placeholder="https://example.com/hook" />
            <Field label="Event (optional)" value={newEvent} onChange={setNewEvent} placeholder="task.completed" />
            <ActionButton label="Create" onClick={create} />
          </div>
          {items.length === 0 ? (
            <EmptyState title="No webhooks" body="Create a webhook above." />
          ) : (
            <div className="grid gap-2">
              {items.map((w: any, i: number) => (
                <div key={w.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{w.url || w.id}</div>
                    {w.event && <span className="text-xs text-muted-foreground">{w.event}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {w.status && <Badge status={w.status} />}
                    <ActionButton label="Delete" onClick={() => remove(w.id)} variant="danger" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
