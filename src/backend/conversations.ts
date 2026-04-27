import type { PluginAPI } from '../shared/types.js';
import { getPluginConfig } from './config.js';
import { getCurrentState, replaceState } from './state.js';
import { BACKEND_KEY } from '../shared/constants.js';
import { cleanText } from './utils.js';
import { randomUUID } from 'node:crypto';

/* ── Module-scoped managed conversation set ── */

export const managedConversationIds = new Set<string>();

/* ── Hydrate managed conversations from existing data ── */

export function hydrateManagedConversations(api: PluginAPI): void {
  managedConversationIds.clear();
  const conversations = api.conversations.list();

  for (const conversation of conversations) {
    const metadata = (conversation?.metadata || {}) as Record<string, unknown>;
    if (metadata.pluginName !== 'legion') continue;

    managedConversationIds.add(conversation.id);
  }
}

/* ── Create a managed conversation ── */

export async function createManagedConversation(
  api: PluginAPI,
  options: { title?: string; prompt?: string; open?: boolean; kind?: string },
): Promise<Record<string, unknown>> {
  const config = getPluginConfig(api);
  const kind = cleanText(options.kind) || 'workspace';
  const conversationId = randomUUID();
  const now = new Date().toISOString();
  const title = cleanText(options.title) || config.workspaceThreadTitle;
  const initialPrompt = cleanText(options.prompt) || config.bootstrapPrompt;
  const selectedBackendKey = config.backendEnabled ? BACKEND_KEY : null;

  const existing = api.conversations.get(conversationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ex = existing as any;

  api.conversations.upsert({
    id: conversationId,
    title,
    fallbackTitle: title,
    messages: ex?.messages || [],
    messageTree: ex?.messageTree || [],
    headId: ex?.headId || null,
    conversationCompaction: null,
    lastContextUsage: null,
    createdAt: ex?.createdAt || now,
    updatedAt: now,
    lastMessageAt: ex?.lastMessageAt || null,
    titleStatus: 'ready',
    titleUpdatedAt: now,
    messageCount: ex?.messageCount || 0,
    userMessageCount: ex?.userMessageCount || 0,
    runStatus: 'idle',
    hasUnread: ex?.hasUnread || false,
    lastAssistantUpdateAt: ex?.lastAssistantUpdateAt || null,
    selectedModelKey: ex?.selectedModelKey || null,
    selectedProfileKey: ex?.selectedProfileKey || null,
    fallbackEnabled: ex?.fallbackEnabled || false,
    profilePrimaryModelKey: ex?.profilePrimaryModelKey || null,
    currentWorkingDirectory: ex?.currentWorkingDirectory || null,
    selectedBackendKey,
    metadata: {
      ...(ex?.metadata || {}),
      pluginName: 'legion',
      source: 'legion-plugin',
      legionKind: kind,
      serviceUrl: config.daemonUrl || null,
    },
  });

  managedConversationIds.add(conversationId);

  if (initialPrompt && (!existing || (existing.messageCount || 0) === 0)) {
    api.conversations.appendMessage(conversationId, {
      role: 'assistant',
      content: [{ type: 'text', text: initialPrompt }],
      metadata: {
        pluginName: 'legion',
        kind: `${kind}-bootstrap`,
      },
      createdAt: now,
    });
  }

  if (options.open !== false) {
    api.conversations.setActive(conversationId);
  }

  const nextState = replaceState(api, {
    managedConversationIds: [...managedConversationIds],
    lastConversationId: conversationId,
    lastConversationTitle: title,
  }, {
    reason: 'conversation-created',
    recordHistory: true,
  });

  api.state.emitEvent('conversation-created', {
    conversationId,
    title,
    selectedBackendKey,
    kind,
  });

  if (config.notificationsEnabled) {
    api.notifications.show({
      id: `conversation-${conversationId}`,
      title: 'Legion thread created',
      body: `${title}${selectedBackendKey ? ' using Legion backend' : ''}`,
      level: 'info',
      native: false,
      autoDismissMs: 4_000,
      target: { type: 'conversation', conversationId },
    });
  }

  return {
    ok: true,
    conversationId,
    title,
    selectedBackendKey,
    state: nextState,
  };
}

