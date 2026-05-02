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
            background: 'radial-gradient(ellipse at center, rgba(245,215,120,0.10), transparent 70%)',
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
                <stop offset="0%" stopColor="#A5B4FC" />
                <stop offset="45%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
              <radialGradient id="core" cx="50%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="42%" stopColor="#F5D778" />
                <stop offset="100%" stopColor="#D4AF37" />
              </radialGradient>
            </defs>
            <circle cx="60" cy="60" r="52" fill="#09090B" stroke="white" strokeOpacity="0.10" strokeWidth="1.2" />
            <path d="M60 9 L68 24 H52 L60 9Z" fill="#F5D778" opacity="0.55" />
            <path d="M60 111 L52 96 H68 L60 111Z" fill="#F5D778" opacity="0.42" />
            <path d="M9 60 L24 52 V68 L9 60Z" fill="#A5B4FC" opacity="0.28" />
            <path d="M111 60 L96 68 V52 L111 60Z" fill="#A5B4FC" opacity="0.28" />
            <circle cx="60" cy="60" r="42" stroke="url(#g)" strokeWidth="1.3" strokeOpacity="0.50" />
            <path d="M31 35 V86" stroke="url(#g)" strokeWidth="8" strokeLinecap="round" />
            <path d="M89 35 V86" stroke="url(#g)" strokeWidth="8" strokeLinecap="round" />
            <path d="M34 36 L86 84" stroke="url(#g)" strokeWidth="8" strokeLinecap="round" opacity="0.92" />
            <path d="M86 36 L34 84" stroke="url(#g)" strokeWidth="8" strokeLinecap="round" opacity="0.72" />
            <circle cx="60" cy="60" r="11" fill="url(#core)" />
            <circle cx="60" cy="60" r="4.2" fill="#09090B" opacity="0.92" />
          </svg>

          <span
            style={{
              fontSize: '48px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(to right, #ffffff, #c7d2fe, #f5d778)',
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
            background: 'linear-gradient(to right, #A5B4FC, #6366F1, #7C3AED, #F5D778)',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
