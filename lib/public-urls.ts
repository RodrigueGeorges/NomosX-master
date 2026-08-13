const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://nomosx.com";

/** Canonical public routes (DA + IA unifiées) */
export const PUBLIC_ROUTES = {
  home: "/",
  archives: "/archives",
  inquiry: (slug: string) => `/inquiry/${slug}`,
  researchers: "/researchers",
  studio: "/studio",
  about: "/about",
  methodology: "/methodology",
  pricing: "/pricing",
  trackRecord: "/track-record",
} as const;

export function inquiryUrl(slug: string, absolute = false): string {
  const path = PUBLIC_ROUTES.inquiry(slug);
  return absolute ? `${BASE}${path}` : path;
}

export function archivesUrl(absolute = false): string {
  return absolute ? `${BASE}${PUBLIC_ROUTES.archives}` : PUBLIC_ROUTES.archives;
}

export function archivesDomainUrl(domain: string, absolute = false): string {
  const q = encodeURIComponent(domain);
  const path = `${PUBLIC_ROUTES.archives}?domain=${q}`;
  return absolute ? `${BASE}${path}` : path;
}
