import type { InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-glow focus:outline-none focus:ring-1 focus:ring-glow ${className}`}
      {...props}
    />
  );
}
