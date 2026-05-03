import typography from '@tailwindcss/typography';

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        "bg-elevated": "#080808",
        panel: "#0d0d0d",
        panel2: "#111111",
        border: "rgba(255, 255, 255, 0.08)",
        text: "#ffffff",
        muted: {
          DEFAULT: "rgba(255, 255, 255, 0.60)",
          foreground: "rgba(255, 255, 255, 0.30)"
        },
        accent: "#137CBD",
        primary: "#137CBD",
        ai: "#137CBD",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        secondary: "rgba(255,255,255,0.45)",
        background: "#000000"
      },
      fontFamily: {
        primary: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        display: ['var(--font-secondary)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        glow: "0 0 40px rgba(74,123,247,0.12), 0 0 80px rgba(74,123,247,0.04)",
        "glow-strong": "0 0 30px rgba(74,123,247,0.22), 0 0 60px rgba(74,123,247,0.10)",
        card: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.6)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      }
    }
  },
  plugins: [typography]
};
