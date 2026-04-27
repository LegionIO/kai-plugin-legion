/**
 * Type definitions for the Legion plugin main process.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginAPI = any;

export type PluginConfig = {
  enabled: boolean;
  daemonUrl: string;
  configDir: string;
  apiKey: string;
  readyPath: string;
  healthPath: string;
  streamPath: string;
  eventsPath: string;
  backendEnabled: boolean;
  daemonStreaming: boolean;
  notificationsEnabled: boolean;
  nativeNotifications: boolean;
  autoConnectEvents: boolean;
  healthPollMs: number;
  eventsRecentCount: number;
  sseReconnectMs: number;
  workspaceThreadTitle: string;
  bootstrapPrompt: string;
  knowledgeRagEnabled: boolean;
  knowledgeCaptureEnabled: boolean;
  knowledgeScope: string;
  triggersEnabled: boolean;
  autoTriage: boolean;
  triageModel: string;
  maxConcurrentWorkflows: number;
  triggerRules: TriggerRule[];
};

export type DaemonResult<T = unknown> = {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T | null;
};

export type PluginState = Record<string, unknown>;

export type Notification = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  timestamp: string;
  read: boolean;
  raw: unknown;
};

export type Workflow = {
  id: string;
  source: string;
  eventType: string;
  action: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  taskId: string;
  payload: unknown;
  summary?: string;
  error?: string;
};

export type PanelDefinition = {
  id: string;
  navId: string;
  title: string;
  icon: string;
  priority: number;
  width: string;
  view: string;
};

export type TriggerRule = {
  source: string;
  eventType: string;
  action: string;
  filter?: string;
};

export type TriggerEnvelope = {
  type: string;
  source: string;
  eventType: string;
  payload: unknown;
};
