/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { cx } from '../lib/utils.js';

type Props = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'danger';
};

export function ActionButton({ label, onClick, disabled, variant = 'default' }: Props): any {
  const classes =
    variant === 'secondary'
      ? 'border border-border/70 bg-card/60 text-foreground hover:bg-muted/50'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-600/90'
        : 'bg-primary text-primary-foreground hover:bg-primary/90';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'rounded-2xl px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        classes,
      )}
    >
      {label}
    </button>
  );
}
