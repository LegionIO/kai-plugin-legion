/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fmtAgo, fmtNumber, asArray } from '../lib/utils.js';
import { Section, ActionButton, Field, TextAreaField, StatCard, Badge, JsonBox, EmptyState } from '../components/index.js';

export function SubAgentsView({ pluginState, onAction }: any): any {
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const subAgents = asArray(pluginState?.subAgents);
  const totalCount = subAgents.length;
  const runningCount = subAgents.filter((s: any) => s.status === 'running' || s.status === 'pending').length;
  const completedCount = subAgents.filter((s: any) => s.status === 'completed' || s.status === 'resolved' || s.status === 'success').length;
  const failedCount = subAgents.filter((s: any) => s.status === 'failed' || s.status === 'error').length;

  const spawnSubAgent = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('create-subagent', {
        message: message.trim(),
        model: model.trim() || undefined,
        parentConversationId: pluginState?.proactiveConversationId || undefined,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to spawn sub-agent.');
      } else {
        setMessage('');
        setModel('');
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshSubAgents = async () => {
    setBusy(true);
    setError('');
    try {
      await Promise.resolve(onAction?.('refresh-subagents'));
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshSubAgents();
  }, []);

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}

      <Section
        title="Sub-Agent Overview"
        subtitle="Summary of all spawned sub-agent tasks managed by the Legion plugin."
        actions={[
          <ActionButton key="refresh" label={busy ? 'Refreshing...' : 'Refresh'} onClick={refreshSubAgents} disabled={busy} variant="secondary" />,
        ]}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total" value={fmtNumber(totalCount)} />
          <StatCard label="Running" value={fmtNumber(runningCount)} subvalue="Active tasks" />
          <StatCard label="Completed" value={fmtNumber(completedCount)} subvalue="Successfully finished" />
          <StatCard label="Failed" value={fmtNumber(failedCount)} subvalue="Errored tasks" />
        </div>
      </Section>

      <Section
        title="Spawn Sub-Agent"
        subtitle="Create a new bounded sub-agent task with an optional model override."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <TextAreaField label="Task Message" value={message} onChange={setMessage} placeholder="Describe the task for the sub-agent to execute." rows={5} />
          <div className="grid content-start gap-3">
            <Field label="Model Override" value={model} onChange={setModel} placeholder="Optional model" />
            <ActionButton label={busy ? 'Spawning...' : 'Spawn Sub-Agent'} onClick={spawnSubAgent} disabled={busy || !message.trim()} />
          </div>
        </div>
      </Section>

      <Section
        title="Sub-Agent Tasks"
        subtitle="All sub-agent tasks tracked by the plugin. Click to expand details."
      >
        {subAgents.length === 0 ? (
          <EmptyState title="No sub-agents" body="Spawn a sub-agent above or wait for daemon trigger workflows to create them." />
        ) : (
          <div className="space-y-2">
            {subAgents.map((agent: any, index: number) => {
              const id = agent.id || agent.taskId || agent.task_id || `subagent-${index}`;
              const isExpanded = expandedId === id;
              const title = agent.title || agent.name || agent.message?.slice(0, 80) || `Sub-Agent ${index + 1}`;
              const status = agent.status || 'unknown';

              return (
                <div key={id} className="rounded-2xl border border-border/60 bg-background/45 transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? '' : id)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{title}</span>
                        <Badge status={status} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[
                          agent.model && `model: ${agent.model}`,
                          agent.createdAt && fmtAgo(agent.createdAt),
                          agent.conversationId && `conv: ${agent.conversationId.slice(0, 8)}...`,
                        ].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{isExpanded ? 'Hide' : 'Show'}</span>
                  </button>
                  {isExpanded ? (
                    <div className="border-t border-border/50 px-4 py-3">
                      {agent.message ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{agent.message}</p> : null}
                      {agent.summary ? <p className="mt-2 text-sm text-foreground">{agent.summary}</p> : null}
                      {agent.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-300">{agent.error}</p> : null}
                      {agent.result || agent.output ? (
                        <div className="mt-3">
                          <JsonBox value={agent.result || agent.output} emptyLabel="No result data." />
                        </div>
                      ) : null}
                      <div className="mt-3 text-[11px] text-muted-foreground">
                        {[
                          agent.startedAt && `Started: ${fmtAgo(agent.startedAt)}`,
                          agent.completedAt && `Completed: ${fmtAgo(agent.completedAt)}`,
                          agent.duration && `Duration: ${agent.duration}ms`,
                        ].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
