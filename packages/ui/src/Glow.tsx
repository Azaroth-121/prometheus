/** A small pulsing ember dot -- the web app's counterpart to the extension
 *  popup's own Framer-Motion `Glow` (apps/extension/src/popup/ui.tsx). Pure
 *  CSS animation here rather than pulling in a motion library for one
 *  decorative flourish; the extension keeps its own richer version since it
 *  already depends on `motion` for its interaction animations. */
export function Glow({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-full bg-brand-gradient shadow-glow-sm ${className}`}
    />
  );
}
