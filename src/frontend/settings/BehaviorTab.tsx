/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Section, Toggle } from '../components/index.js';

export function BehaviorTab({ draft, setDraft }: any): any {
  return (
    <Section
      title="Behavior"
      subtitle="Control backend registration, notifications, proactive thread behavior, and workflow routing."
    >
      <div className="grid gap-3">
        <Toggle label="Plugin Enabled" description="Turn Legion runtime features on or off without removing the plugin." checked={draft.enabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, enabled: checked }))} />
        <Toggle label="Legion Backend" description="Register the plugin-provided daemon backend for Legion-managed conversations." checked={draft.backendEnabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, backendEnabled: checked }))} />
        <Toggle label="Daemon Streaming" description="Prefer daemon SSE streaming for chat requests, with sync and task fallback when needed." checked={draft.daemonStreaming} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, daemonStreaming: checked }))} />
        <Toggle label="Notifications" description="Allow Legion to surface toast and native notifications for daemon events." checked={draft.notificationsEnabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, notificationsEnabled: checked }))} />
        <Toggle label="Native Notifications" description="Send native OS notifications for high-signal daemon events when Legion fires alerts." checked={draft.nativeNotifications} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, nativeNotifications: checked }))} />
        <Toggle label="Event Stream" description="Keep a live SSE connection open for daemon notifications, trigger routing, and proactive activity." checked={draft.autoConnectEvents} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, autoConnectEvents: checked }))} />
        <Toggle label="Auto-open Proactive Thread" description="Bring the GAIA/proactive conversation to the foreground when new proactive events arrive." checked={draft.openProactiveThread} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, openProactiveThread: checked }))} />
        <Toggle label="Knowledge RAG" description="Forward daemon knowledge retrieval flags through the Legion backend adapter." checked={draft.knowledgeRagEnabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, knowledgeRagEnabled: checked }))} />
        <Toggle label="Knowledge Capture" description="Allow the Legion backend adapter to request knowledge capture during daemon inference." checked={draft.knowledgeCaptureEnabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, knowledgeCaptureEnabled: checked }))} />
        <Toggle label="Trigger Routing" description="Route trigger.* daemon events into observe/act workflow handling inside the plugin." checked={draft.triggersEnabled} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, triggersEnabled: checked }))} />
        <Toggle label="Auto Triage" description="Default unmatched trigger events to observe unless a rule says otherwise." checked={draft.autoTriage} onChange={(checked: boolean) => setDraft((current: any) => ({ ...current, autoTriage: checked }))} />
      </div>
    </Section>
  );
}
