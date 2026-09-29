import typography from '@tailwindcss/typography';

/**
 * NomosX Design System — SpaceX grammar (public) + internal palette via CSS vars
 */
export default {
  darkMode: 'class',
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        "bg-elevated": "var(--color-bg-elevated)",
        panel: "var(--color-bg-panel)",
        background: "var(--color-bg)",
        border: "var(--color-border)",
        text: "var(--color-text)",
        muted: {
          DEFAULT: "var(--color-text-muted)",
          foreground: "var(--color-text-dim)",
        },
        secondary: "var(--nx-text-secondary)",
        accent: "var(--color-accent)",
        primary: "var(--color-primary)",
        ai: "var(--color-accent)",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
      fontFamily: {
        primary: ["var(--font-primary)", "Barlow", "system-ui", "sans-serif"],
        sans: ["var(--font-primary)", "Barlow", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Barlow Semi Condensed", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: { xl: "4px", "2xl": "4px" },
      boxShadow: {
        glow: "none",
        "glow-strong": "none",
        card: "var(--nx-shadow-card)",
        glass: "none",
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
          '0%, 100%': { boxShadow: '0 0 0 0 transparent' },
          '50%':      { boxShadow: '0 0 0 0 transparent' },
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
