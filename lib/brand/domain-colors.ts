/**
 * Domain → signature color for generative covers and tags.
 * Aligned with the researcher/lens palette in lib/researchers.ts.
 */

const DOMAIN_COLORS: Record<string, string> = {
  economics: "#6366F1",
  economy: "#6366F1",
  technology: "#0EA5E9",
  ai: "#0EA5E9",
  policy: "#8B5CF6",
  governance: "#8B5CF6",
  health: "#10B981",
  security: "#F59E0B",
  cybersecurity: "#F59E0B",
  law: "#F43F5E",
  environment: "#14B8A6",
  climate: "#14B8A6",
  finance: "#F97316",
  "finance & markets": "#F97316",
  geopolitics: "#EF4444",
  energy: "#22C55E",
  "energy systems": "#22C55E",
  biotechnology: "#F472B6",
  humanities: "#64748B",
  research: "#64748B",
  analysis: "#64748B",
  strategy: "#64748B",
  general: "#64748B",
};

export function domainColor(domain: string | undefined | null): string {
  if (!domain) return DOMAIN_COLORS.general;
  return DOMAIN_COLORS[domain.toLowerCase()] ?? DOMAIN_COLORS.general;
}
