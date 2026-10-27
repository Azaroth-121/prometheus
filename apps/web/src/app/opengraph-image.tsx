import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '28px',
          background: '#05070d',
          backgroundImage:
            'radial-gradient(circle at 50% 35%, rgba(59,130,246,0.25), transparent 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
            }}
          />
          <span
            style={{
              fontSize: '28px',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#8b96ad',
            }}
          >
            Prometheus
          </span>
        </div>
        <span style={{ fontSize: '64px', fontWeight: 700, color: '#e8edf7' }}>
          Ask better, get better.
        </span>
        <span style={{ fontSize: '28px', color: '#8b96ad' }}>
          Turn a rough request into a structured, copy-ready prompt.
        </span>
      </div>
    ),
    { ...size }
  );
}
