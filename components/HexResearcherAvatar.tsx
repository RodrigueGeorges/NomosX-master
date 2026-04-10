"use client";

import React, { useState } from 'react';
import { Researcher } from '@/lib/researchers';
import {
  TrendingUp, Brain, Shield, BookOpen,
  Scale, Leaf, Calculator, Cpu,
  Users, GraduationCap, Zap, Globe,
  Eye, Smartphone, Building2, Heart, AlertTriangle
} from 'lucide-react';

interface HexResearcherAvatarProps {
  researcher: Researcher;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: 'idle' | 'analyzing' | 'debating' | 'synthesizing';
  interactive?: boolean;
  className?: string;
}

const domainIcons: Record<string, React.ElementType> = {
  // === CORE 9 DOMAINS ===
  economics:       TrendingUp,
  technology:      Cpu,
  policy:          Shield,
  health:          BookOpen,
  security:        Scale,
  law:             Scale,
  environment:     Leaf,
  quantitative:    Calculator,
  finance:         TrendingUp,
  // === ADVANCED 6 DOMAINS ===
  "social-sciences": Users,
  humanities:      GraduationCap,
  "energy-advanced": Zap,
  geopolitics:      Globe,
  "cognitive-science": Eye,
  "digital-society": Smartphone,
  // === SPECIALIZED 7 DOMAINS ===
  "behavioral-economics": Users,
  "urban-studies": Building2,
  "development-economics": TrendingUp,
  "computational-social-science": Cpu,
  "bioethics": Heart,
  "complexity-science": Brain,
  "risk-analysis": AlertTriangle,
  default:         Brain,
};

const statusConfig = {
  idle:         { color: 'rgba(255,255,255,0.25)', label: 'Idle',       pulse: false },
  analyzing:    { color: '#4ade80',                label: 'Analyzing',  pulse: true  },
  debating:     { color: '#facc15',                label: 'Debating',   pulse: true  },
  synthesizing: { color: '#818cf8',                label: 'Synthesizing', pulse: true },
};

const sizeDef = {
  sm: { outer: 40,  stroke: 1.5, iconSize: 10, fontSize: 7,  statusR: 4,  statusOff: 3  },
  md: { outer: 56,  stroke: 2,   iconSize: 14, fontSize: 9,  statusR: 5,  statusOff: 4  },
  lg: { outer: 72,  stroke: 2,   iconSize: 18, fontSize: 11, statusR: 6,  statusOff: 5  },
  xl: { outer: 96,  stroke: 2.5, iconSize: 24, fontSize: 14, statusR: 7,  statusOff: 6  },
};

/** Returns the 6 points of a regular hexagon centred at (cx,cy) with given radius */
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

/** Generates a deterministic circuit-board path inside the hex */
function circuitPath(cx: number, cy: number, r: number, seed: string): string {
  // Simple deterministic pseudo-random from seed string
  const hash = seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  const rng = (n: number) => Math.abs(Math.sin(hash * (n + 1) * 9301 + 49297)) ;

  const inner = r * 0.55;
  const paths: string[] = [];

  // 4 radial lines from centre to mid-hex edge, with 90° branches
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 180) * (60 * i + rng(i) * 30 - 15);
    const x1 = cx + inner * 0.3 * Math.cos(angle);
    const y1 = cy + inner * 0.3 * Math.sin(angle);
    const x2 = cx + inner * Math.cos(angle);
    const y2 = cy + inner * Math.sin(angle);
    // branch perpendicular
    const bLen = inner * (0.2 + rng(i + 4) * 0.25);
    const bx = x2 + bLen * Math.cos(angle + Math.PI / 2);
    const by = y2 + bLen * Math.sin(angle + Math.PI / 2);
    paths.push(`M ${x1} ${y1} L ${x2} ${y2} L ${bx} ${by}`);
  }

  // Small corner dots (rendered as tiny circles via path arcs would be complex — skip, use <circle> separately)
  return paths.join(' ');
}

export default function HexResearcherAvatar({
  researcher,
  size = 'md',
  showStatus = false,
  status = 'idle',
  interactive = false,
  className = '',
}: HexResearcherAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const def = sizeDef[size];
  const dim = def.outer;
  const cx = dim / 2;
  const cy = dim / 2;
  const outerR = dim / 2 - def.stroke;
  const innerR = outerR * 0.78;
  const faceR  = outerR * 0.52;

  const color = researcher.colorHex;
  const Icon  = (domainIcons[researcher.id] ?? domainIcons.default) as React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  const sc    = statusConfig[status];
  const gradId   = `hex-grad-${researcher.id}-${size}`;
  const clipId   = `hex-clip-${researcher.id}-${size}`;
  const glowId   = `hex-glow-${researcher.id}-${size}`;
  const circuitD = circuitPath(cx, cy, innerR, researcher.id);

  // Status dot position: bottom-right vertex of outer hex
  const statusAngle = (Math.PI / 180) * (60 * 2 - 30); // vertex index 2 → bottom-right
  const sdx = cx + outerR * Math.cos(statusAngle);
  const sdy = cy + outerR * Math.sin(statusAngle);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: dim, height: dim }}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
    >
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: hovered
            ? `drop-shadow(0 0 ${dim * 0.18}px ${color}55)`
            : `drop-shadow(0 0 ${dim * 0.1}px ${color}30)`,
          transition: 'filter 0.4s ease',
        }}
      >
        <defs>
          {/* Radial gradient fill */}
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
            <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
            <stop offset="60%"  stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
          </radialGradient>

          {/* Clip to hex shape */}
          <clipPath id={clipId}>
            <polygon points={hexPoints(cx, cy, outerR)} />
          </clipPath>

          {/* Glow filter for active status */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Outer hex border (animated glow when active) ── */}
        <polygon
          points={hexPoints(cx, cy, outerR)}
          fill={`url(#${gradId})`}
          stroke={color}
          strokeWidth={def.stroke}
          strokeOpacity={hovered ? 0.9 : 0.45}
          style={{ transition: 'stroke-opacity 0.4s ease' }}
        />

        {/* ── Inner hex (darker fill) ── */}
        <polygon
          points={hexPoints(cx, cy, innerR)}
          fill={color}
          fillOpacity="0.06"
          stroke={color}
          strokeWidth={def.stroke * 0.6}
          strokeOpacity="0.2"
        />

        {/* ── Circuit board traces ── */}
        <g clipPath={`url(#${clipId})`} opacity={hovered ? 0.55 : 0.3} style={{ transition: 'opacity 0.4s' }}>
          <path
            d={circuitD}
            stroke={color}
            strokeWidth={def.stroke * 0.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Circuit node dots */}
          {[0, 1, 2, 3].map(i => {
            const a = (Math.PI / 180) * (60 * i + 15);
            const nr = innerR * 0.62;
            return (
              <circle
                key={i}
                cx={cx + nr * Math.cos(a)}
                cy={cy + nr * Math.sin(a)}
                r={def.stroke * 0.9}
                fill={color}
                fillOpacity="0.8"
              />
            );
          })}
        </g>

        {/* ── Face circle ── */}
        <circle
          cx={cx}
          cy={cy}
          r={faceR}
          fill={color}
          fillOpacity="0.1"
          stroke={color}
          strokeWidth={def.stroke * 0.7}
          strokeOpacity="0.35"
        />

        {/* ── Domain icon (rendered via foreignObject for Lucide) ── */}
        <foreignObject
          x={cx - def.iconSize / 2}
          y={cy - def.iconSize / 2 - def.fontSize * 0.7}
          width={def.iconSize}
          height={def.iconSize}
          style={{ overflow: 'visible' }}
        >
          <div
            style={{
              width: def.iconSize,
              height: def.iconSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color,
              opacity: hovered ? 1 : 0.8,
              transition: 'opacity 0.3s',
            }}
          >
            <Icon size={def.iconSize} strokeWidth={1.8} />
          </div>
        </foreignObject>

        {/* ── Initials ── */}
        <text
          x={cx}
          y={cy + faceR * 0.52}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={def.fontSize}
          fontWeight="700"
          fontFamily="var(--font-secondary, system-ui)"
          letterSpacing="0.08em"
          fill={color}
          fillOpacity="0.9"
        >
          {researcher.initials}
        </text>

        {/* ── Corner tick marks (hex vertices) ── */}
        {[0, 2, 4].map(i => {
          const a = (Math.PI / 180) * (60 * i - 30);
          const r1 = outerR * 0.88;
          const r2 = outerR * 0.98;
          return (
            <line
              key={i}
              x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
              stroke={color}
              strokeWidth={def.stroke}
              strokeOpacity="0.6"
              strokeLinecap="round"
            />
          );
        })}

        {/* ── Status indicator ── */}
        {showStatus && (
          <g>
            {/* Halo ring when active */}
            {sc.pulse && (
              <circle
                cx={sdx} cy={sdy} r={def.statusR + 2}
                fill={sc.color}
                fillOpacity="0.2"
              >
                <animate attributeName="r" values={`${def.statusR + 1};${def.statusR + 4};${def.statusR + 1}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="fill-opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Dot border (matches bg) */}
            <circle
              cx={sdx} cy={sdy} r={def.statusR + 1.5}
              fill="#09090b"
            />
            {/* Status dot */}
            <circle
              cx={sdx} cy={sdy} r={def.statusR}
              fill={sc.color}
            />
          </g>
        )}
      </svg>

      {/* ── Hover tooltip ── */}
      {interactive && hovered && (
        <div
          className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap pointer-events-none z-50 animate-slide-in-top"
          style={{
            background: '#0C0C12',
            borderColor: `${color}40`,
            color: color,
          }}
        >
          {researcher.name.split(' ').slice(-1)[0]} · {researcher.domain}
        </div>
      )}
    </div>
  );
}
