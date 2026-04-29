/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fmtTime, asArray, parseJson } from '../lib/utils.js';
import { getBridge } from '../lib/bridge.js';
import { Section, ActionButton, Field, TextAreaField, SegmentTabs, JsonBox, EmptyState } from '../components/index.js';

export function KnowledgeView({ onAction }: any): any {
  const bridge = getBridge();
  const [tab, setTab] = useState('query');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState('10');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [browseTag, setBrowseTag] = useState('');
  const [browseSource, setBrowseSource] = useState('');
  const [browseResult, setBrowseResult] = useState<any>(null);
  const [ingestContent, setIngestContent] = useState('');
  const [metadataText, setMetadataText] = useState('{}');
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [healthResult, setHealthResult] = useState<any>(null);
  const [statusResult, setStatusResult] = useState<any>(null);
  const [absorbInput, setAbsorbInput] = useState('');
  const [jobId, setJobId] = useState('');
  const [absorbResult, setAbsorbResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: string, data: any, setter: any) => {
    setBusy(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.(action, data));
      if (result?.ok === false) {
        setError(result.error || 'Request failed.');
        if (setter) setter(null);
      } else if (setter) {
        setter(result?.data ?? result);
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      if (setter) setter(null);
    } finally {
      setBusy(false);
    }
  };

  const refreshMonitors = async () => {
    try {
      const result = await Promise.resolve(onAction?.('knowledge-monitors-list'));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load monitors.');
        return;
      }
      setMonitors(asArray(result?.data, 'monitors'));
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  };

  const refreshHealth = async () => {
    try {
      const [statusRes, healthRes] = await Promise.all([
        Promise.resolve(onAction?.('knowledge-status')),
        Promise.resolve(onAction?.('knowledge-health')),
      ]);
      setStatusResult(statusRes?.data || null);
      setHealthResult(healthRes?.data || null);
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setStatusResult(null);
      setHealthResult(null);
    }
  };

  useEffect(() => {
    if (tab === 'monitors' && monitors.length === 0) {
      void refreshMonitors();
    }
    if (tab === 'health' && !statusResult && !healthResult) {
      void refreshHealth();
    }
  }, [tab]);

  const pickFiles = async () => {
    const raw = await bridge?.dialog?.openFile?.({
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm', 'md', 'csv', 'json', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    const files = raw?.files || [];
    if (!Array.isArray(files) || files.length === 0) return;
    const paths = files.map((file: any) => file?.path).filter(Boolean);
    if (paths.length === 0) return;
    await run('knowledge-ingest-file', { filePath: paths[0] }, setIngestResult);
  };

  const pickDirectory = async () => {
    const result = await bridge?.dialog?.openDirectoryFiles?.();
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) return;
    await run('knowledge-ingest-file', { filePath: result.filePaths[0] }, setIngestResult);
  };

  const tabs = [
    { key: 'query', label: 'Query' },
    { key: 'browse', label: 'Browse' },
    { key: 'ingest', label: 'Ingest' },
    { key: 'monitors', label: 'Monitors' },
    { key: 'health', label: 'Health' },
    { key: 'absorb', label: 'Absorb' },
  ];

  let body: any = null;

  if (tab === 'query') {
    body = (
      <Section title="Apollo Query" subtitle="Run retrieval queries against daemon knowledge stores.">
        <div className="grid gap-4 lg:grid-cols-[1fr_160px]">
          <TextAreaField label="Query" value={query} onChange={setQuery} placeholder="What knowledge should Legion retrieve?" rows={4} />
          <Field label="Limit" value={limit} onChange={setLimit} placeholder="10" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton label={busy ? 'Querying...' : 'Query'} onClick={() => run('knowledge-query', { query, limit: Number(limit) || 10 }, setQueryResult)} disabled={busy || !query.trim()} />
        </div>
        <div className="mt-4">
          <JsonBox value={queryResult} emptyLabel="Run a knowledge query to inspect results here." />
        </div>
      </Section>
    );
  }

  if (tab === 'browse') {
    body = (
      <Section title="Browse Knowledge" subtitle="Search daemon entries by tag or source channel.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tag" value={browseTag} onChange={setBrowseTag} placeholder="project, code, docs" />
          <Field label="Source" value={browseSource} onChange={setBrowseSource} placeholder="github, slack, local file" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton label={busy ? 'Loading...' : 'Browse'} onClick={() => run('knowledge-browse', { filters: { tag: browseTag, source: browseSource, per_page: '50' } }, setBrowseResult)} disabled={busy} />
        </div>
        <div className="mt-4">
          <JsonBox value={browseResult} emptyLabel="Browse results will appear here." />
        </div>
      </Section>
    );
  }

  if (tab === 'ingest') {
    body = (
      <Section title="Ingest Content" subtitle="Send text or selected files into daemon knowledge ingestion.">
        <TextAreaField label="Content" value={ingestContent} onChange={setIngestContent} placeholder="Paste text, markdown, notes, or extracted content to ingest." rows={8} />
        <TextAreaField label="Metadata JSON" value={metadataText} onChange={setMetadataText} placeholder='{"tags":["notes"]}' rows={5} />
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            label={busy ? 'Ingesting...' : 'Ingest Text'}
            onClick={() => {
              const metadata = parseJson(metadataText, {});
              if (metadata == null) {
                setError('Metadata JSON must be valid.');
                return;
              }
              void run('knowledge-ingest-content', { content: ingestContent, metadata }, setIngestResult);
            }}
            disabled={busy || !ingestContent.trim()}
          />
          <ActionButton label="Pick File" onClick={() => { void pickFiles(); }} disabled={busy} variant="secondary" />
          <ActionButton label="Pick Directory" onClick={() => { void pickDirectory(); }} disabled={busy} variant="secondary" />
        </div>
        <div className="mt-4">
          <JsonBox value={ingestResult} emptyLabel="No ingest results yet." />
        </div>
      </Section>
    );
  }

  if (tab === 'monitors') {
    body = (
      <Section
        title="Corpus Monitors"
        subtitle="Manage daemon-side filesystem monitors for knowledge capture."
        actions={[
          <ActionButton key="refresh" label="Refresh" onClick={() => { void refreshMonitors(); }} variant="secondary" />,
        ]}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <ActionButton label="Choose Path And Add" onClick={async () => {
            const raw = await bridge?.dialog?.openFile?.();
            const filePath = raw?.files?.[0]?.path;
            if (filePath) {
              const slashIndex = filePath.lastIndexOf('/');
              const dirPath = slashIndex >= 0 ? filePath.slice(0, slashIndex) : filePath;
              await run('knowledge-monitor-add', { path: dirPath }, null);
              await refreshMonitors();
            }
          }} variant="secondary" />
        </div>
        {monitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No monitors are currently configured.</p>
        ) : (
          <div className="space-y-2">
            {monitors.map((monitor: any) => (
              <div key={monitor.id || monitor.path} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium break-all">{monitor.path || monitor.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{`${monitor.status || 'unknown'}${monitor.file_count != null ? ` • ${monitor.file_count} files` : ''}${monitor.last_scan ? ` • last scan ${fmtTime(monitor.last_scan)}` : ''}`}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton label="Scan" onClick={() => { void run('knowledge-monitor-scan', { id: monitor.id }, null).then(() => refreshMonitors()); }} variant="secondary" />
                    <ActionButton label="Remove" onClick={() => { void run('knowledge-monitor-remove', { id: monitor.id }, null).then(() => refreshMonitors()); }} variant="danger" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    );
  }

  if (tab === 'health') {
    body = (
      <Section
        title="Knowledge Health"
        subtitle="Inspect daemon Apollo health and run maintenance."
        actions={[
          <ActionButton key="refresh" label="Refresh" onClick={() => { void refreshHealth(); }} variant="secondary" />,
          <ActionButton key="maintain" label="Run Maintenance" onClick={() => { void run('knowledge-maintain', {}, setHealthResult).then(() => refreshHealth()); }} variant="secondary" />,
        ]}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <JsonBox value={statusResult} emptyLabel="No knowledge status loaded yet." />
          <JsonBox value={healthResult} emptyLabel="No Apollo stats loaded yet." />
        </div>
      </Section>
    );
  }

  if (tab === 'absorb') {
    body = (
      <Section title="Absorber Pipeline" subtitle="Resolve and dispatch absorber jobs through the daemon.">
        <TextAreaField label="Input" value={absorbInput} onChange={setAbsorbInput} placeholder="Describe what should be resolved or dispatched." rows={4} />
        <Field label="Job ID" value={jobId} onChange={setJobId} placeholder="Optional existing job id" />
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton label="Resolve" onClick={() => run('absorber-resolve', { input: absorbInput }, setAbsorbResult)} disabled={busy || !absorbInput.trim()} />
          <ActionButton label="Dispatch" onClick={() => run('absorber-dispatch', { input: absorbInput }, setAbsorbResult)} disabled={busy || !absorbInput.trim()} variant="secondary" />
          <ActionButton label="Lookup Job" onClick={() => run('absorber-job', { jobId }, setAbsorbResult)} disabled={busy || !jobId.trim()} variant="secondary" />
        </div>
        <div className="mt-4">
          <JsonBox value={absorbResult} emptyLabel="No absorber result yet." />
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      <SegmentTabs tabs={tabs} active={tab} onChange={setTab} />
      {body}
    </div>
  );
}
