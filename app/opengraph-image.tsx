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
          background: '#0A0A0B',
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
            background: 'radial-gradient(ellipse at center, rgba(74,158,255,0.12), transparent 70%)',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '28px',
          }}
        >
          <span
            style={{
              fontSize: '52px',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: '#F5F5F7',
            }}
          >
            Nomos
            <span style={{ color: '#4A9EFF' }}>X</span>
          </span>
        </div>

        <div
          style={{
            fontSize: '26px',
            fontWeight: 600,
            color: '#F5F5F7',
            textAlign: 'center',
            marginBottom: '10px',
            letterSpacing: '-0.01em',
          }}
        >
          The Autonomous Think Tank
        </div>

        <div
          style={{
            fontSize: '16px',
            color: 'rgba(245,245,247,0.45)',
            textAlign: 'center',
            maxWidth: '640px',
            lineHeight: 1.5,
            marginBottom: '36px',
          }}
        >
          Probabilistic inquiries · Multi-agent simulation · Full source traceability
        </div>

        <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          {[
            { value: '250M+', label: 'Sources' },
            { value: '22', label: 'Researchers' },
            { value: '6', label: 'Pipeline stages' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <span style={{ fontSize: '22px', fontWeight: 500, color: '#F5F5F7', fontFamily: 'monospace' }}>
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: 'rgba(245,245,247,0.34)',
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
            height: '3px',
            background: '#4A9EFF',
            opacity: 0.6,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
