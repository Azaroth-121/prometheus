import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Mirrors packages/ui/src/Glow.tsx's dot (brand-gradient + void background)
// as a static favicon -- can't reuse the CSS pulse animation, so this is
// just the gradient dot at rest.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070d',
          borderRadius: '50%',
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
