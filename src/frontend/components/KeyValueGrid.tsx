/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

type Props = {
  items: [string, any][];
};

export function KeyValueGrid({ items }: Props): any {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
          <div className="mt-1 break-all text-sm font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}
