/**
 * NomosX public surface — SpaceX-like monochrome tokens.
 * Import in public pages/components for consistent typography & controls.
 */
export const nx = {
  eyebrow: "font-mono text-[10px] uppercase tracking-[0.24em] text-white/35",
  h1: "font-display text-3xl sm:text-4xl lg:text-[3rem] font-semibold tracking-tight text-white leading-[1.08]",
  h2: "font-display text-xl sm:text-2xl font-semibold text-white tracking-tight",
  body: "text-sm text-white/45 leading-relaxed",
  label: "font-mono text-[10px] uppercase tracking-[0.16em] text-white/30",

  btnPrimary:
    "inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-black text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-white/90 transition-colors disabled:opacity-50",
  btnSecondary:
    "inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-white/30 text-white/80 text-[11px] font-medium uppercase tracking-[0.14em] hover:border-white/60 hover:text-white transition-colors",
  btnGhost:
    "inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/15 text-white/60 text-[11px] font-mono uppercase tracking-[0.12em] hover:border-white/35 hover:text-white transition-colors",

  surface: "border border-white/[0.08] bg-white/[0.02]",
  surfaceHover: "border border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-colors",

  input:
    "w-full px-4 py-3 bg-white/[0.04] border border-white/[0.12] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 transition-colors",
  select:
    "px-3 py-2.5 bg-white/[0.04] border border-white/[0.12] text-sm font-mono text-[11px] text-white/70 focus:outline-none focus:border-white/30",

  chip: "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40 border border-white/[0.08]",
  chipActive: "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white border border-white/25 bg-white/10",

  icon: "text-white/45",
  link: "text-white/50 hover:text-white transition-colors underline-offset-4 hover:underline",
  accentText: "text-white/75",

  spinner: "border-2 border-white/20 border-t-white rounded-full animate-spin",

  prose:
    "prose prose-invert prose-lg max-w-none prose-headings:font-display prose-headings:font-medium prose-headings:text-white prose-p:text-white/70 prose-li:text-white/65 prose-a:text-white/80 prose-a:underline hover:prose-a:text-white prose-strong:text-white prose-blockquote:border-white/20 prose-code:text-white/90 prose-code:bg-white/10 prose-code:px-1",
} as const;
