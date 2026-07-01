/** Shared monochrome email brand tokens (SpaceX-like, matches public UI). */
export const EMAIL_BRAND = {
  bg: "#000000",
  surface: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  borderSolid: "#1a1a1a",
  text: "#e4e4e7",
  muted: "#a1a1aa",
  dim: "#52525b",
  white: "#ffffff",
  black: "#000000",
  eyebrow:
    "font-size:10px;font-weight:600;letter-spacing:0.2em;color:rgba(255,255,255,0.35);text-transform:uppercase;",
  cta:
    "display:inline-block;background:#ffffff;color:#000000;text-decoration:none;padding:12px 28px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;",
  ctaSm:
    "display:inline-block;background:#ffffff;color:#000000;text-decoration:none;padding:10px 22px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;",
  link: "color:#a1a1aa;text-decoration:underline;text-underline-offset:2px;",
  linkPlain: "color:#a1a1aa;text-decoration:none;font-weight:500;",
  hr: "border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;",
} as const;

export function emailTrustColor(score: number): string {
  return score >= 85 ? EMAIL_BRAND.white : score >= 70 ? EMAIL_BRAND.muted : EMAIL_BRAND.dim;
}
