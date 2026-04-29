/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, Field } from '../components/index.js';

export function TriggersTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEvent, setNewEvent] = useState('');
  const [newAction, setNewAction] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('triggers-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newEvent.trim()) return;
    await Promise.resolve(onAction?.('trigger-create', { event: newEvent, action: newAction }));
    setNewEvent(''); setNewAction('');
    void load();
  };

  const remove = async (id: string) => {
    await Promise.resolve(onAction?.('trigger-delete', { id }));
    void load();
  };

  const items = asArray(data);

  return (
    <Section
      title="Triggers"
      subtitle={`${items.length} trigger rules`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-end gap-2">
            <Field label="Event" value={newEvent} onChange={setNewEvent} placeholder="task.completed" />
            <Field label="Action" value={newAction} onChange={setNewAction} placeholder="notify" />
            <ActionButton label="Create" onClick={create} />
          </div>
          {items.length === 0 ? (
            <EmptyState title="No triggers" body="Create a trigger rule above." />
          ) : (
            <div className="grid gap-2">
              {items.map((t: any, i: number) => (
                <div key={t.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{t.event || t.name || t.id}</span>
                    {t.action && <span className="ml-2 text-xs text-muted-foreground">{t.action}</span>}
                    {t.enabled != null && <span className="ml-2"><Badge status={t.enabled ? 'online' : 'disabled'} /></span>}
                  </div>
                  <ActionButton label="Delete" onClick={() => remove(t.id)} variant="danger" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
