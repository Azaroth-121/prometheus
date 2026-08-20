import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-glow-sm hover:shadow-glow disabled:bg-none disabled:bg-surface-raised disabled:text-ink-muted disabled:shadow-none',
  secondary:
    'bg-surface-raised text-ink border border-line hover:border-glow/60 hover:shadow-glow-sm',
  ghost: 'bg-transparent text-glow-cyan hover:bg-surface-raised',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
