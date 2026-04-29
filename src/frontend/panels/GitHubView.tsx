/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fmtAgo, asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, Field, SegmentTabs, JsonBox, EmptyState } from '../components/index.js';

export function GitHubView({ onAction }: any): any {
  const [tab, setTab] = useState('pulls');
  const [repoFilter, setRepoFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      const [statusResult, repoResult] = await Promise.all([
        Promise.resolve(onAction?.('daemon-call', { path: '/api/github/status', quiet: true })),
        Promise.resolve(onAction?.('daemon-call', { path: '/api/github/repos', quiet: true })),
      ]);
      setStatus(statusResult?.data || null);
      setRepos(asArray(repoResult?.data).map((entry: any) => typeof entry === 'string' ? entry : entry?.full_name || entry?.name).filter(Boolean));
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setStatus(null);
      setRepos([]);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const path = tab === 'pulls' ? '/api/github/pulls' : tab === 'issues' ? '/api/github/issues' : '/api/github/commits';
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path,
        query: repoFilter ? { repo: repoFilter } : undefined,
        quiet: true,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Request failed.');
        setItems([]);
      } else {
        setItems(asArray(result?.data));
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    void loadItems();
  }, [tab, repoFilter]);

  const openExternal = (url: string) => {
    if (!url) return;
    void onAction?.('open-external', { url });
  };

  return (
    <div className="space-y-5">
      <Section
        title="GitHub"
        subtitle="Daemon-backed GitHub status, pull requests, issues, and commits."
        actions={[
          <ActionButton key="refresh" label={loading ? 'Refreshing...' : 'Refresh'} onClick={() => { void loadStatus(); void loadItems(); }} disabled={loading} variant="secondary" />,
        ]}
      >
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <JsonBox value={status} emptyLabel="No GitHub status loaded yet." />
          <div className="space-y-3">
            <SegmentTabs
              tabs={[
                { key: 'pulls', label: 'Pull Requests' },
                { key: 'issues', label: 'Issues' },
                { key: 'commits', label: 'Commits' },
              ]}
              active={tab}
              onChange={setTab}
            />
            <Field label="Repo Filter" value={repoFilter} onChange={setRepoFilter} placeholder={repos.length > 0 ? repos[0] : 'owner/repo'} />
            {repos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {repos.slice(0, 12).map((repo: string) => (
                  <ActionButton
                    key={repo}
                    label={repo}
                    onClick={() => setRepoFilter(repoFilter === repo ? '' : repo)}
                    variant={repoFilter === repo ? 'default' : 'secondary'}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Section>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading GitHub data...</p> : null}
      {!loading && items.length === 0 ? <EmptyState title="No GitHub records" body="Refresh the panel or adjust the repo filter to load daemon-backed GitHub data." /> : null}
      {!loading && items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item: any, index: number) => {
            const repo = item?.repo || item?.repository || item?.full_name || item?.name || '';
            const title = item?.title || item?.message || item?.sha || item?.head_sha || `${tab} record ${index + 1}`;
            const stateValue = item?.state || item?.status || '';
            const url = item?.html_url || item?.url || item?.web_url || '';
            const metaLine = [
              repo,
              item?.author?.login || item?.user?.login || item?.author || '',
              item?.updated_at ? fmtAgo(item.updated_at) : item?.created_at ? fmtAgo(item.created_at) : '',
            ].filter(Boolean).join(' • ');
            return (
              <div key={`${title}-${index}`} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium break-all">{title}</div>
                    {metaLine ? <div className="mt-1 text-xs text-muted-foreground">{metaLine}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {stateValue ? <Badge status={String(stateValue).toLowerCase()} /> : null}
                    {url ? <ActionButton label="Open" onClick={() => openExternal(url)} variant="secondary" /> : null}
                  </div>
                </div>
                {item?.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
