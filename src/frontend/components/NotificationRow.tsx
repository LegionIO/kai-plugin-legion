/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { cx, fmtAgo, fmtTime } from '../lib/utils.js';
import { Badge } from './Badge.js';
import { JsonBox } from './JsonBox.js';

type Notification = {
  id: string;
  title: string;
  severity: string;
  type: string;
  timestamp: string;
  source?: string;
  message?: string;
  read?: boolean;
  raw?: any;
};

type Props = {
  notification: Notification;
  expanded: boolean;
  onToggle: () => void;
  onRead: () => void;
};

export function NotificationRow({ notification, expanded, onToggle, onRead }: Props): any {
  return (
    <div
      className={cx(
        'rounded-2xl border border-border/60 bg-background/45 transition-colors',
        !notification.read && 'ring-1 ring-primary/30',
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (!notification.read) onRead();
          onToggle();
        }}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!notification.read ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
            <span className="text-sm font-medium">{notification.title}</span>
            <Badge status={notification.severity} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {`${notification.type} • ${fmtAgo(notification.timestamp)}${notification.source ? ` • ${notification.source}` : ''}`}
          </p>
          {notification.message && !expanded ? (
            <p className="mt-2 truncate text-sm text-muted-foreground">{notification.message}</p>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded ? (
        <div className="border-t border-border/50 px-4 py-3">
          {notification.message ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notification.message}</p>
          ) : null}
          <div className="mt-3 text-[11px] text-muted-foreground">{fmtTime(notification.timestamp)}</div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Raw event</summary>
            <JsonBox value={notification.raw} emptyLabel="No raw payload." />
          </details>
        </div>
      ) : null}
    </div>
  );
}
