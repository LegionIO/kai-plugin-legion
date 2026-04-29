/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { safeJson, parseJson } from '../lib/utils.js';
import { Section, ActionButton, TextAreaField } from '../components/index.js';

export function DaemonConfigTab({ onAction }: { onAction: any }) {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-settings-get'));
      if (result?.ok === false) { setError(result.error || 'Failed'); return; }
      setRaw(safeJson(result?.data ?? result));
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    const parsed = parseJson(raw, null);
    if (parsed == null) { setError('Invalid JSON'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-settings-update', parsed));
      if (result?.ok === false) { setError(result.error || 'Save failed'); } else { setSuccess('Settings saved.'); }
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Section
      title="Daemon Config"
      subtitle="Read and write daemon /api/settings"
      actions={[
        <ActionButton key="s" label={saving ? 'Saving...' : 'Save'} onClick={save} disabled={saving || loading} />,
        <ActionButton key="r" label={loading ? 'Loading...' : 'Reload'} onClick={load} disabled={loading} variant="secondary" />,
      ]}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid gap-3">
          {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>}
          {success && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-300">{success}</div>}
          <TextAreaField label="Settings JSON" value={raw} onChange={setRaw} rows={14} />
        </div>
      )}
    </Section>
  );
}
