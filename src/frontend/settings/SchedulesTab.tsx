/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { asArray, fmtTime } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, Field } from '../components/index.js';

export function SchedulesTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newCron, setNewCron] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('schedules-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newName.trim() || !newCron.trim()) return;
    await Promise.resolve(onAction?.('schedule-create', { name: newName, cron: newCron }));
    setNewName(''); setNewCron('');
    void load();
  };

  const remove = async (id: string) => {
    await Promise.resolve(onAction?.('schedule-delete', { id }));
    void load();
  };

  const items = asArray(data);

  return (
    <Section
      title="Schedules"
      subtitle={`${items.length} schedules`}
      actions={<ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={load} disabled={loading} variant="secondary" />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-end gap-2">
            <Field label="Name" value={newName} onChange={setNewName} placeholder="my-schedule" />
            <Field label="Cron" value={newCron} onChange={setNewCron} placeholder="*/5 * * * *" />
            <ActionButton label="Create" onClick={create} />
          </div>
          {items.length === 0 ? (
            <EmptyState title="No schedules" body="Create a schedule above." />
          ) : (
            <div className="grid gap-2">
              {items.map((s: any, i: number) => (
                <div key={s.id || i} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{s.name || s.id}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{s.cron || s.expression}</span>
                    {s.nextRun && <span className="ml-2 text-xs text-muted-foreground">next: {fmtTime(s.nextRun)}</span>}
                  </div>
                  <ActionButton label="Delete" onClick={() => remove(s.id)} variant="danger" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
