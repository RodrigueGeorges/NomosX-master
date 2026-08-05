import { ImageResponse } from 'next/og';
import { LOGO_GLYPHS, LOGO_LAYOUT, logoHeightFromCap } from '@/lib/brand/logo-paths';
import { BRAND_NAME } from '@/lib/brand/public-copy';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';

export const runtime = 'edge';
export const alt = 'NomosX Brief';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const V = LOGO_LAYOUT;
const OG_ACCENT = '#FFFFFF';

function OgXMark({ cap }: { cap: number }) {
  const h = logoHeightFromCap(cap);
  const w = (h / V.H) * V.Wwm;
  const xIndex = LOGO_GLYPHS.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${V.Wwm} ${V.H}`}>
      <g transform={`translate(${V.pad},${V.baselineY}) scale(${V.S},${-V.S})`} fill="#FFFFFF">
        {LOGO_GLYPHS.map((g, i) => {
          if (i === xIndex) {
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

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;

  let title = 'NomosX Brief';
  let formatLabel = 'BRIEF';
  let sources = 0;
  let readTime = 0;

  try {
    const article = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ OR: [{ id: slug }, { publicId: slug }] }),
      select: {
        title: true,
        type: true,
        sourceIds: true,
        wordCount: true,
      },
    });

    if (article) {
      title = article.title || title;
      formatLabel = getPublicationFormat(article.type).label.toUpperCase();
      sources = article.sourceIds?.length || 0;
      readTime = Math.max(1, Math.ceil(article.wordCount / 200));
    }
  } catch {
    // fallback to defaults
  }

  const displayTitle = title.length > 80 ? title.slice(0, 77) + '…' : title;

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
          padding: '60px 72px',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 'auto' }}>
          <OgXMark cap={28} />
          <span style={{ fontSize: '18px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em' }}>
            {BRAND_NAME}
          </span>
        </div>

        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span
            style={{
              fontSize: '13px',
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
        </div>

        <div
          style={{
            fontSize: '42px',
            fontWeight: 600,
            color: '#FFFFFF',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: '1000px',
            marginBottom: 'auto',
          }}
        >
          {displayTitle}
        </div>

        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', marginTop: '20px' }}>
          {sources > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', fontWeight: 500, color: '#FFFFFF', fontFamily: 'monospace' }}>
                {sources}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.34)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                Sources
              </span>
            </div>
          )}
          {readTime > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', fontWeight: 500, color: '#FFFFFF', fontFamily: 'monospace' }}>
                {readTime} min
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.34)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                Read time
              </span>
            </div>
          )}
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
