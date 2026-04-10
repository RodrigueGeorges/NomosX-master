import typography from '@tailwindcss/typography';

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#09090b",
        "bg-elevated": "#111113",
        panel: "#18181b",
        panel2: "#1f1f23",
        border: "rgba(255, 255, 255, 0.06)",
        text: "#fafafa",
        muted: {
          DEFAULT: "rgba(255, 255, 255, 0.55)",
          foreground: "rgba(255, 255, 255, 0.35)"
        },
        accent: "#6366f1",
        primary: "#6366f1",
        ai: "#818cf8",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        secondary: "#a78bfa",
        background: "#09090b"
      },
      fontFamily: {
        primary: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-primary)', 'system-ui', 'sans-serif'],
        display: ['var(--font-secondary)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        glow: "0 0 40px rgba(99, 102, 241, 0.15), 0 0 80px rgba(99, 102, 241, 0.05)",
        "glow-strong": "0 0 30px rgba(99, 102, 241, 0.3), 0 0 60px rgba(99, 102, 241, 0.15)",
        card: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.4)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
      }
    }
  },
  plugins: [typography]
};
