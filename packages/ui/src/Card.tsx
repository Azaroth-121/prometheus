import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded border border-gray-200 bg-white p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}
