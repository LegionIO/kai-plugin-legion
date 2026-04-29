/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fmtAgo, fmtTime, asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, Field, TextAreaField, JsonBox, EmptyState } from '../components/index.js';

export function WorkflowsView({ pluginState, onAction }: any): any {
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskError, setTaskError] = useState('');
  const [busy, setBusy] = useState(false);
  const workflows = Array.isArray(pluginState?.workflows) ? pluginState.workflows : [];

  const loadTasks = async () => {
    setBusy(true);
    setTaskError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/tasks', quiet: true }));
      if (result?.ok === false) {
        setTaskError(result.error || 'Failed to load daemon tasks.');
        setTasks([]);
      } else {
        setTasks(asArray(result?.data));
      }
    } catch (error: any) {
      setTaskError(error instanceof Error ? error.message : String(error));
      setTasks([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (tasks.length === 0) {
      void loadTasks();
    }
  }, []);

  const createSubAgent = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setTaskError('');
    try {
      const result = await Promise.resolve(onAction?.('create-subagent', {
        message: message.trim(),
        model: model.trim() || undefined,
        parentConversationId: pluginState?.proactiveConversationId || undefined,
      }));
      if (result?.ok === false) {
        setTaskError(result.error || 'Failed to create sub-agent.');
      } else {
        setMessage('');
        void loadTasks();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Section
        title="Trigger Workflows"
        subtitle="Plugin-managed observe/act workflows routed from daemon trigger events."
        actions={[
          <ActionButton key="refresh-workflows" label="Refresh Workflow Status" onClick={() => { void onAction?.('refresh-workflows'); }} variant="secondary" />,
          <ActionButton key="open-thread" label="Open Proactive Thread" onClick={() => { void onAction?.('open-proactive-thread'); }} variant="secondary" />,
        ]}
      >
        {workflows.length === 0 ? (
          <EmptyState title="No workflows yet" body="Trigger events routed by the daemon will create workflows here when rules match." />
        ) : (
          <div className="space-y-2">
            {workflows.map((workflow: any) => (
              <div key={workflow.id} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{`${workflow.source} • ${workflow.eventType}`}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{`${workflow.action} • started ${fmtTime(workflow.startedAt)}${workflow.taskId ? ` • task ${workflow.taskId}` : ''}`}</div>
                    {workflow.summary ? <p className="mt-2 text-sm text-muted-foreground">{workflow.summary}</p> : null}
                    {workflow.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-300">{workflow.error}</p> : null}
                  </div>
                  <Badge status={workflow.status} />
                </div>
                {workflow.payload ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Payload</summary>
                    <JsonBox value={workflow.payload} emptyLabel="No payload." />
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Daemon Sub-Agent Task"
        subtitle="Manually create a daemon sub-agent task and inspect the broader daemon task queue."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <TextAreaField label="Task Message" value={message} onChange={setMessage} placeholder="Ask the Legion daemon to spawn a sub-agent for a bounded task." rows={5} />
          <div className="grid content-start gap-3">
            <Field label="Model" value={model} onChange={setModel} placeholder="Optional model override" />
            <ActionButton label={busy ? 'Creating...' : 'Create Sub-Agent'} onClick={createSubAgent} disabled={busy || !message.trim()} />
            <ActionButton label="Refresh Tasks" onClick={() => { void loadTasks(); }} disabled={busy} variant="secondary" />
          </div>
        </div>
      </Section>
      {taskError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{taskError}</div> : null}
      {tasks.length === 0 && !busy ? <EmptyState title="No daemon tasks loaded" body="Refresh tasks to inspect the daemon queue." /> : null}
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.slice(0, 25).map((task: any, index: number) => (
            <div key={task?.id || task?.task_id || index} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium break-all">{task?.name || task?.title || task?.id || task?.task_id || `Task ${index + 1}`}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{`${task?.created_at ? fmtAgo(task.created_at) : 'recent'}${task?.parent_id ? ` • parent ${task.parent_id}` : ''}`}</div>
                </div>
                <Badge status={String(task?.status || 'unknown').toLowerCase()} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
