/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

type Props = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ label, description, checked, onChange }: Props): any {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event: any) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border"
      />
    </label>
  );
}
