/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Section, ActionButton, NotificationRow, EmptyState } from '../components/index.js';

export function NotificationsView({ pluginState, onAction }: any): any {
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState('');
  const notifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications : [];
  const filtered = filter === 'all' ? notifications : notifications.filter((item: any) => item.severity === filter);

  const markRead = async (id: string) => {
    await Promise.resolve(onAction?.('notification-mark-read', { id }));
  };

  return (
    <div className="space-y-5">
      <Section
        title="Notification Feed"
        subtitle="Legion SSE activity, proactive events, and workflow alerts stored inside plugin state."
        actions={[
          <ActionButton key="recent" label="Load Recent Events" onClick={() => onAction?.('load-recent-events')} variant="secondary" />,
          <ActionButton key="read" label="Mark All Read" onClick={() => onAction?.('notification-mark-all-read')} variant="secondary" />,
          <ActionButton key="clear" label="Clear" onClick={() => onAction?.('notification-clear')} variant="secondary" />,
        ]}
      >
        <div className="flex flex-wrap gap-2">
          {(['all', 'error', 'warn', 'success', 'info'] as const).map((severity) => (
            <ActionButton
              key={severity}
              label={severity === 'all' ? `All (${notifications.length})` : `${severity} (${notifications.filter((item: any) => item.severity === severity).length})`}
              onClick={() => setFilter(severity)}
              variant={filter === severity ? 'default' : 'secondary'}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No notifications" body="Daemon events, proactive messages, and workflow alerts will appear here." />
        ) : (
          <div className="space-y-2">
            {filtered.map((notification: any) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                expanded={expandedId === notification.id}
                onToggle={() => setExpandedId(expandedId === notification.id ? '' : notification.id)}
                onRead={() => { void markRead(notification.id); }}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
