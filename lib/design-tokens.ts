/**
 * Design System Tokens
 * Professional, research-grade aesthetic inspired by Vercel/Linear
 */

export const tokens = {
  colors: {
    // Base
    bg: "#0B0E12",
    bgPanel: "#10151D",
    bgPanel2: "#151B26",
    border: "#232833",
    borderHover: "#2D3440",
    
    // Text
    text: "#EDE9E2",
    textMuted: "#8B8F98",
    textDim: "#5A5E66",
    
    // Primary (blue/violet)
    primary: "#4C6EF5",
    primaryHover: "#5B7FF7",
    primaryMuted: "rgba(76, 110, 245, 0.15)",
    
    // Accent (cyan/teal)
    accent: "#5EEAD4",
    accentMuted: "rgba(94, 234, 212, 0.15)",
    
    // Semantic
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    
    // Gradients
    aiGradient: "linear-gradient(90deg, rgba(76,110,245,0.0), rgba(94,234,212,0.55), rgba(124,58,237,0.0))",
  },
  
  typography: {
    fontSans: "var(--font-sans)",
    fontMono: "JetBrains Mono, Menlo, Monaco, monospace",
    
    sizes: {
      xs: "0.75rem",    // 12px
      sm: "0.875rem",   // 14px
      base: "1rem",     // 16px
      lg: "1.125rem",   // 18px
      xl: "1.25rem",    // 20px
      "2xl": "1.5rem",  // 24px
      "3xl": "1.875rem",// 30px
      "4xl": "2.25rem", // 36px
      "5xl": "3rem",    // 48px
    },
    
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    
    lineHeights: {
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
  },
  
  spacing: {
    px: "1px",
    0: "0",
    1: "0.25rem",  // 4px
    2: "0.5rem",   // 8px
    3: "0.75rem",  // 12px
    4: "1rem",     // 16px
    5: "1.25rem",  // 20px
    6: "1.5rem",   // 24px
    8: "2rem",     // 32px
    10: "2.5rem",  // 40px
    12: "3rem",    // 48px
    16: "4rem",    // 64px
    20: "5rem",    // 80px
  },
  
  radii: {
    sm: "0.25rem",   // 4px
    md: "0.5rem",    // 8px
    lg: "0.75rem",   // 12px
    xl: "1rem",      // 16px
    "2xl": "1.5rem", // 24px
    full: "9999px",
  },
  
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    glow: "0 0 20px rgba(76, 110, 245, 0.3)",
    glowAccent: "0 0 20px rgba(94, 234, 212, 0.3)",
  },
  
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    base: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

export type DesignTokens = typeof tokens;
