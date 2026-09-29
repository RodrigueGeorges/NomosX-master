import { ImageResponse } from 'next/og';
import { headers } from 'next/headers';
import { LOGO_GLYPHS, LOGO_LAYOUT, logoHeightFromCap } from '@/lib/brand/logo-paths';
import { BRAND_NAME } from '@/lib/brand/public-copy';
import { getPublicationFormat } from '@/lib/publication-formats';
import { frescoFieldFor, FRESCO_COLS, FRESCO_ROWS } from '@/lib/brand/fresco-fields';

export const runtime = 'edge';
export const alt = 'NomosX Brief';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const V = LOGO_LAYOUT;

const RC = 96;
const RR = 26;

function OgFresco({ field }: { field: number[] }) {
  const cw = size.width / RC;
  const ch = size.height / RR;
  const cells = [];
  for (let r = 0; r < RR; r++) {
    const sr = Math.min(FRESCO_ROWS - 1, Math.floor((r * FRESCO_ROWS) / RR));
    for (let c = 0; c < RC; c++) {
      const sc = Math.min(FRESCO_COLS - 1, Math.floor((c * FRESCO_COLS) / RC));
      const v = field[sr * FRESCO_COLS + sc] / 100;
      if (v < 0.07) continue;
      cells.push(
        <div
          key={r * RC + c}
          style={{
            position: 'absolute',
            left: c * cw,
            top: r * ch,
            width: cw + 1,
            height: ch + 1,
            background: `rgba(228,218,200,${Math.min(0.5, v * 0.42).toFixed(3)})`,
          }}
        />
      );
    }
  }
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' }}>
      {cells}
    </div>
  );
}

function OgXMark({ cap, color = '#FFFFFF' }: { cap: number; color?: string }) {
  const h = logoHeightFromCap(cap);
  const w = (h / V.H) * V.Wwm;
  const xIndex = LOGO_GLYPHS.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${V.Wwm} ${V.H}`}>
      <g transform={`translate(${V.pad},${V.baselineY}) scale(${V.S},${-V.S})`} fill={color}>
        {LOGO_GLYPHS.map((g, i) => {
          if (i === xIndex) {
            return (
              <g key={i} transform={`translate(${g.x},0)`}>
                <line x1={50} y1={700} x2={450} y2={0} stroke={color} strokeWidth={88} strokeLinecap="round" fill="none" />
                <line x1={450} y1={700} x2={50} y2={0} stroke={color} strokeWidth={88} strokeLinecap="round" fill="none" />
                <circle cx={250} cy={350} r={28} fill={color} stroke="none" />
              </g>
            );
          }
          return <path key={i} transform={`translate(${g.x},0)`} d={g.d} />;
        })}
      </g>
    </svg>
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Image({ params }: Props) {
  const { id } = await params;

  let title = 'NomosX Brief';
  let formatLabel = 'BRIEF';
  let domain = '';
  let heroImageUrl: string | null = null;
  let fresco: number[] | undefined;

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com');

    const res = await fetch(`${origin}/api/articles/${id}?lite=1`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const article = data?.article;
      if (article) {
        title = article.title || title;
        formatLabel = getPublicationFormat(article.type).label.toUpperCase();
        heroImageUrl = article.heroImageUrl || null;
        domain = article.domain || '';
        fresco = frescoFieldFor(article.verticalSlug ?? domain);
      }
    }
  } catch {
    // fallback to defaults
  }

  const cleanTitle = title.replace(/\[SRC-\d+\]/g, '').replace(/\[E\d+\]/g, '').trim();
  const displayTitle = cleanTitle.length > 100 ? cleanTitle.slice(0, 97) + '…' : cleanTitle;

  // ── EDITORIAL MODE: hero illustration as full-bleed background ──
  if (heroImageUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily: 'system-ui, sans-serif',
            background: '#000000',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt=""
            width={size.width}
            height={size.height}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />

          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '55%',
              background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.9) 100%)',
            }}
          />

          <div
            style={{
              position: 'absolute',
              top: '40px',
              left: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <OgXMark cap={22} color="#FFFFFF" />
            <span style={{ fontSize: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em' }}>
              {BRAND_NAME}
            </span>
          </div>

          <div
            style={{
              position: 'absolute',
              top: '40px',
              right: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.7)',
                fontFamily: 'monospace',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '4px 10px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
              }}
            >
              {formatLabel}
            </span>
            {domain && (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {domain}
              </span>
            )}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '48px',
              left: '48px',
              right: '48px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: '38px',
                fontWeight: 600,
                color: '#FFFFFF',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                maxWidth: '1050px',
                textShadow: '0 2px 20px rgba(0,0,0,0.8)',
              }}
            >
              {displayTitle}
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: '#FFFFFF',
              opacity: 0.3,
            }}
          />
        </div>
      ),
      { ...size }
    );
  }

  // ── FALLBACK MODE: no hero image — branded dark card ──
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#000000',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
          padding: '56px 64px',
        }}
      >
        {fresco && <OgFresco field={fresco} />}

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: fresco
              ? 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.88) 100%)'
              : 'radial-gradient(ellipse at center, rgba(255,255,255,0.07), transparent 70%)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: 'auto' }}>
          <OgXMark cap={26} />
          <span style={{ fontSize: '17px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>
            {BRAND_NAME}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#FFFFFF',
              fontFamily: 'monospace',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '4px 12px',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {formatLabel}
          </span>
          {domain && (
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {domain}
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: '42px',
            fontWeight: 600,
            color: '#FFFFFF',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: '1020px',
            marginBottom: 'auto',
          }}
        >
          {displayTitle}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '2px',
            background: '#FFFFFF',
            opacity: 0.35,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
