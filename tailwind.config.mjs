import typography from '@tailwindcss/typography';

/**
 * NomosX Design System — Ethereal × Palantir
 * ─────────────────────────────────────────────
 * Principles:
 *   • One canonical blue (#4A9EFF — ethereal, calm, less saturated than Palantir Blueprint)
 *   • Near-black backgrounds (#0A0A0B, not pure black — easier on eyes)
 *   • Near-white text (#F5F5F7, not pure white — softer authority)
 *   • Generous space, monospace for data points (verdict, sources, IDs)
 *   • No gradients beyond 2 stops, no glows > 0.15 opacity
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ─── Surfaces ─────────────────────────────────
        bg: "#0A0A0B",           // void — near-black with warmth
        "bg-elevated": "#111114", // mist — first elevation
        panel: "#18181C",         // haze — second elevation
        panel2: "#1F1F24",        // deep — third elevation (rarely used)
        background: "#0A0A0B",
        border: "rgba(255, 255, 255, 0.07)",

        // ─── Text — 4 levels of authority ─────────────
        text: "#F5F5F7",          // primary — near-white, softer authority
        muted: {
          DEFAULT: "rgba(245, 245, 247, 0.62)",  // secondary
          foreground: "rgba(245, 245, 247, 0.34)" // tertiary
        },
        secondary: "rgba(245, 245, 247, 0.50)",

        // ─── Accent — single canonical blue ───────────
        accent: "#4A9EFF",        // ethereal blue — the only chromatic accent
        primary: "#4A9EFF",
        ai: "#4A9EFF",

        // ─── Semantic ─────────────────────────────────
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
      fontFamily: {
        primary: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        display: ['var(--font-secondary)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Cormorant Garamond', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        // All glows align to the single canonical accent (#4A9EFF)
        glow: "0 0 40px rgba(74, 158, 255, 0.10), 0 0 80px rgba(74, 158, 255, 0.04)",
        "glow-strong": "0 0 30px rgba(74, 158, 255, 0.18), 0 0 60px rgba(74, 158, 255, 0.08)",
        card: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 40px rgba(0, 0, 0, 0.55)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      },
      keyframes: {
        // ─── Signature animations — ethereal × Palantir ──────
        // breath: a slow, gentle inhale-exhale — the rhythm of the think tank
        breath: {
          '0%, 100%': { opacity: '0.6', transform: 'translateY(0)' },
          '50%':      { opacity: '1.0', transform: 'translateY(-1px)' },
        },
        // rise: content appears with a calm 600ms reveal
        rise: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // trace: a number "calculates itself" — AI-native subtle signal
        trace: {
          '0%':   { opacity: '0.3', filter: 'blur(2px)' },
          '100%': { opacity: '1.0', filter: 'blur(0)' },
        },
        // halo: a source citation breathes a faint glow on hover
        halo: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(74, 158, 255, 0)' },
          '50%':      { boxShadow: '0 0 24px 0 rgba(74, 158, 255, 0.10)' },
        },
        // drift: very slow particle motion — atmospheric, never distracting
        drift: {
          '0%':   { transform: 'translate(0, 0)' },
          '50%':  { transform: 'translate(8px, -6px)' },
          '100%': { transform: 'translate(0, 0)' },
        },
      },
      animation: {
        breath: 'breath 5s ease-in-out infinite',
        rise:   'rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        trace:  'trace 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        halo:   'halo 2.4s ease-in-out infinite',
        drift:  'drift 60s ease-in-out infinite',
      },
    }
  },
  plugins: [typography]
};
