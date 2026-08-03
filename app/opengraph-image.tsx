import { ImageResponse } from 'next/og';
import { LOGO_GLYPHS, LOGO_LAYOUT, logoHeightFromCap } from '@/lib/brand/logo-paths';
import {
  BRAND_EMAIL_TAGLINE,
  BRAND_SOURCES_LABEL,
  BRAND_TITLE,
} from '@/lib/brand/public-copy';

export const runtime = 'edge';
export const alt = BRAND_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const V = LOGO_LAYOUT;

const OG_ACCENT = '#FFFFFF';

function OgWordmark({ cap }: { cap: number }) {
  const h = logoHeightFromCap(cap);
  const w = (h / V.H) * V.Wwm;
  const xIndex = LOGO_GLYPHS.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${V.Wwm} ${V.H}`}>
      <g transform={`translate(${V.pad},${V.baselineY}) scale(${V.S},${-V.S})`} fill="#FFFFFF">
        {LOGO_GLYPHS.map((g, i) => {
          if (i === xIndex) {
            // Geometric X — two crossing lines + center dot
            return (
              <g key={i} transform={`translate(${g.x},0)`}>
                <line x1={50} y1={700} x2={450} y2={0} stroke={OG_ACCENT} strokeWidth={88} strokeLinecap="round" fill="none" />
                <line x1={450} y1={700} x2={50} y2={0} stroke={OG_ACCENT} strokeWidth={88} strokeLinecap="round" fill="none" />
                <circle cx={250} cy={350} r={28} fill={OG_ACCENT} stroke="none" />
              </g>
            );
          }
          return <path key={i} transform={`translate(${g.x},0)`} d={g.d} />;
        })}
      </g>
    </svg>
  );
}

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
          background: '#000000',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '20%',
            width: '60%',
            height: '55%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06), transparent 70%)',
          }}
        />

        <div style={{ display: 'flex', marginBottom: 28 }}>
          <OgWordmark cap={52} />
        </div>

        <div
          style={{
            fontSize: '26px',
            fontWeight: 600,
            color: '#FFFFFF',
            textAlign: 'center',
            marginBottom: '10px',
            letterSpacing: '-0.01em',
          }}
        >
          {BRAND_EMAIL_TAGLINE}
        </div>

        <div
          style={{
            fontSize: '16px',
            color: 'rgba(255,255,255,0.45)',
            textAlign: 'center',
            maxWidth: '640px',
            lineHeight: 1.5,
            marginBottom: '36px',
          }}
        >
          Verified positions · Scenario distributions · Full source traceability
        </div>

        <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          {[
            { value: BRAND_SOURCES_LABEL, label: 'Sources' },
            { value: '4', label: 'Method stages' },
            { value: '48', label: 'Data providers' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <span style={{ fontSize: '22px', fontWeight: 500, color: '#FFFFFF', fontFamily: 'monospace' }}>
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.34)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '2px',
            background: OG_ACCENT,
            opacity: 0.35,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
