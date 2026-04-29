/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

type Props = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: Props): any {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
