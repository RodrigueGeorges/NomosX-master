import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NomosX — The Autonomous Think Tank';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
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
          background: '#09090b',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '10%',
            width: '80%',
            height: '70%',
            background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.15), transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            right: '10%',
            width: '50%',
            height: '50%',
            background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.08), transparent 70%)',
          }}
        />

        {/* NX Logo text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* Logo symbol — simplified NX */}
          <svg width="72" height="72" viewBox="0 0 120 120" fill="none">
            <defs>
              <linearGradient id="g" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#818CF8" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <path d="M 25 28 L 25 92 L 34 92 L 34 28 Z" fill="url(#g)" />
            <path d="M 86 28 L 86 92 L 95 92 L 95 28 Z" fill="url(#g)" />
            <path d="M 34 33 L 62 60 L 86 84 L 94 77 L 62 51 L 34 26 Z" fill="url(#g)" />
            <path d="M 86 33 L 58 60 L 34 84 L 26 77 L 58 51 L 86 26 Z" fill="url(#g)" opacity="0.8" />
            <circle cx="60" cy="60" r="8" fill="white" opacity="0.9" />
            <circle cx="60" cy="60" r="3.5" fill="#6366F1" />
          </svg>

          <span
            style={{
              fontSize: '48px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(to right, #e0e7ff, #c7d2fe, #ddd6fe)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            NomosX
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            marginBottom: '12px',
            letterSpacing: '-0.01em',
          }}
        >
          The Autonomous Think Tank
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.45)',
            textAlign: 'center',
            maxWidth: '700px',
            lineHeight: 1.5,
            marginBottom: '40px',
          }}
        >
          22 PhD-calibrated AI researchers · 250M+ academic sources · Every claim sourced
        </div>

        {/* Stats bar */}
        <div
          style={{
            display: 'flex',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          {[
            { value: '250M+', label: 'Sources' },
            { value: '22', label: 'Researchers' },
            { value: '16', label: 'Agents' },
            { value: '60+', label: 'Providers' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.3)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(to right, #818CF8, #6366F1, #7C3AED, #6366F1, #818CF8)',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
