import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface-raised p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}
