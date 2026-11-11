import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

/** The flame from design/logo.svg, on a transparent ground so it works on light and dark. */
export function Logo({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="30 10 70 112" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M70 14 C 82 28 88 40 84 52 C 81 61 74 62 72 54 C 71 62 76 68 82 74 C 96 90 94 108 78 116 C 66 122 50 120 42 108 C 33 94 37 78 46 68 C 41 76 40 86 44 92 C 40 82 40 68 48 56 C 54 46 52 36 46 30 C 54 34 58 26 56 18 C 62 22 66 18 70 14 Z"
      />
    </svg>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-line bg-canvas text-ink hover:bg-surface',
  ghost: 'text-ink-muted hover:bg-surface hover:text-ink',
};

export function Button({
  type = 'button',
  variant = 'primary',
  disabled,
  onClick,
  className = '',
  children,
  ariaLabel,
}: {
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const FIELD =
  'w-full rounded-lg border border-line bg-canvas px-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <input id={id} {...props} className={`${FIELD} h-10`} />
    </label>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD} min-h-[180px] resize-none py-2.5 leading-relaxed`} />;
}

/** Radio chips: one small row, clearly secondary to the main action. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option)}
            className={`min-h-8 rounded-full border px-3 text-[13px] font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
              on ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

/** "12 of 20 left" — turns amber at 80% used, red at the limit. */
export function UsagePill({ used, limit }: { used: number; limit: number }) {
  const left = Math.max(limit - used, 0);
  const tone = left === 0 ? 'text-danger' : used / Math.max(limit, 1) >= 0.8 ? 'text-warning' : 'text-ink-muted';
  return (
    <span className={`text-[13px] font-medium tabular-nums ${tone}`}>
      {left} of {limit} left
    </span>
  );
}

export function Menu({ label, items }: { label: string; items: { label: string; href?: string; onSelect?: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-line bg-canvas p-1 shadow-lg">
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-surface"
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-surface"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
