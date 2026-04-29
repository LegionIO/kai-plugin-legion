/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Badge, Section, JsonBox } from '../components/index.js';

export function DoctorTab({ pluginState }: any): any {
  return (
    <Section
      title="Doctor Results"
      subtitle="Most recent daemon diagnostics collected from the plugin."
    >
      {Array.isArray(pluginState?.doctorResults) && pluginState.doctorResults.length > 0 ? (
        <div className="space-y-2">
          {pluginState.doctorResults.map((entry: any) => (
            <div key={`${entry.name}-${entry.duration}`} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{entry.name}</span>
                <Badge status={entry.status === 'pass' ? 'success' : entry.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{entry.message}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{entry.duration}ms</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Run the doctor from settings or Mission Control to populate these checks.</p>
      )}
    </Section>
  );
}
