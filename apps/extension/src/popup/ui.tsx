import { motion, type HTMLMotionProps } from 'motion/react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function Panel({ className = '', children, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={`rounded-xl border border-line bg-surface p-4 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  title?: string;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-gradient text-white shadow-glow-sm hover:shadow-glow',
  secondary: 'border border-line bg-surface-raised text-ink hover:border-glow/60',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-raised',
};

export function Button({
  type = 'button',
  variant = 'primary',
  disabled,
  onClick,
  className = '',
  children,
  title,
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted transition-all focus:border-glow focus:shadow-glow-sm focus:outline-none"
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="h-24 w-full resize-none rounded-lg border border-line bg-surface-raised p-3 text-sm text-ink placeholder:text-ink-muted transition-all focus:border-glow focus:shadow-glow-sm focus:outline-none"
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
}) {
  return (
    <div className="flex rounded-lg border border-line bg-surface-raised p-1 text-xs">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`relative flex-1 rounded-md px-2 py-1.5 capitalize transition-colors ${
            value === option ? 'text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {value === option && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 -z-10 rounded-md bg-brand-gradient shadow-glow-sm"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{option}</span>
        </button>
      ))}
    </div>
  );
}

export function Glow({ className = '' }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={`block rounded-full bg-brand-gradient ${className}`}
      animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.08, 1] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ boxShadow: '0 0 14px 2px rgba(59,130,246,0.55)' }}
    />
  );
}
