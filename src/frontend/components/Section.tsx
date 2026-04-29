/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

type Props = {
  title: string;
  subtitle?: string;
  actions?: any;
  children?: any;
};

export function Section({ title, subtitle, actions, children }: Props): any {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
