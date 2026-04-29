/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { fmtAgo, fmtUptime, fmtNumber } from '../lib/utils.js';
import { Badge, Section, ActionButton, StatCard, JsonBox, EmptyState } from '../components/index.js';

export function DashboardView({ pluginState, onAction }: any): any {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const dashboard = pluginState?.dashboard || null;
  const health = dashboard?.health || {};
  const taskSummary = dashboard?.tasksSummary || {};
  const workerSummary = dashboard?.workersSummary || {};
  const workflows = pluginState?.workflowCounts || {};
  const recentNotifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications.slice(0, 8) : [];

  const runAction = async (action: string, data?: any) => {
    setBusy(true);
    setNote('');
    try {
      const result = await Promise.resolve(onAction?.(action, data));
      if (result?.ok === false && result?.error) {
        setNote(result.error);
      } else {
        setNote(action === 'run-doctor' ? 'Doctor checks refreshed.' : 'Refresh completed.');
      }
    } catch (error: any) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {note ? <div className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-sm">{note}</div> : null}
      <Section
        title="Cluster Snapshot"
        subtitle="A high-level runtime summary pulled from the daemon, event stream, and plugin workflow state."
        actions={[
          <ActionButton key="refresh" label={busy ? 'Refreshing...' : 'Refresh Status'} onClick={() => runAction('refresh-status')} disabled={busy} />,
          <ActionButton key="doctor" label="Run Doctor" onClick={() => runAction('run-doctor')} disabled={busy} variant="secondary" />,
          <ActionButton key="events" label="Load Recent Events" onClick={() => runAction('load-recent-events')} disabled={busy} variant="secondary" />,
          <ActionButton key="gaia" label="Open Proactive Thread" onClick={() => runAction('open-proactive-thread')} disabled={busy} variant="secondary" />,
        ]}
      >
        {dashboard ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Status" value={pluginState?.status || 'unknown'} subvalue={dashboard?.updatedAt ? `Updated ${fmtAgo(dashboard.updatedAt)} ago` : ''} />
            <StatCard label="Uptime" value={fmtUptime(health?.uptime_seconds ?? health?.uptime)} subvalue={health?.version ? `v${health.version}` : ''} />
            <StatCard label="Tasks" value={fmtNumber(taskSummary.total)} subvalue={`${fmtNumber(taskSummary.running)} running • ${fmtNumber(taskSummary.failed)} failed`} />
            <StatCard label="Workers" value={fmtNumber(workerSummary.total)} subvalue={`${fmtNumber(workerSummary.healthy)} healthy • ${fmtNumber(workerSummary.degraded)} degraded`} />
            <StatCard label="Extensions" value={fmtNumber(dashboard?.extensionsCount || 0)} subvalue="Loaded daemon extensions" />
            <StatCard label="Capabilities" value={fmtNumber((dashboard?.capabilities || []).length)} subvalue="Natural-language router suggestions" />
            <StatCard label="Notifications" value={fmtNumber(pluginState?.unreadNotificationCount || 0)} subvalue={`${fmtNumber((pluginState?.notifications || []).length)} retained`} />
            <StatCard label="Workflows" value={fmtNumber(workflows.total || 0)} subvalue={`${fmtNumber(workflows.active || 0)} active • ${fmtNumber(workflows.needsInput || 0)} needs input`} />
          </div>
        ) : (
          <EmptyState title="No dashboard snapshot yet" body="Refresh status to load the current daemon summary." />
        )}
      </Section>
      <Section
        title="Live Details"
        subtitle="Recent health and service summaries preserved in plugin state."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <JsonBox value={dashboard?.health} emptyLabel="No health payload recorded yet." />
          <JsonBox value={{ gaia: dashboard?.gaia, metering: dashboard?.metering, github: dashboard?.githubStatus, knowledge: dashboard?.knowledgeStatus }} emptyLabel="No auxiliary service data yet." />
        </div>
      </Section>
      <Section
        title="Recent Activity"
        subtitle="Newest daemon notifications retained by the plugin event log."
      >
        {recentNotifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Legion events have been captured yet.</p>
        ) : (
          <div className="space-y-2">
            {recentNotifications.map((notification: any) => (
              <div key={notification.id} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{notification.title}</span>
                  <Badge status={notification.severity} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{`${notification.type} • ${fmtAgo(notification.timestamp)}${notification.source ? ` • ${notification.source}` : ''}`}</div>
                {notification.message ? <div className="mt-2 text-sm text-muted-foreground">{notification.message}</div> : null}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
