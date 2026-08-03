"use client";

import { useRouter } from "next/navigation";
import { NomosXLogo } from "@/components/brand/NomosXLogo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand/public-copy";

const FOOTER_LINKS = [
  { label: "Briefs", href: "/archives" },
  { label: "Domains", href: "/researchers" },
  { label: "Method", href: "/methodology" },
  { label: "Studio", href: "/studio" },
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

interface SiteFooterProps {
  onSignInClick?: () => void;
}

export default function SiteFooter(_props: SiteFooterProps) {
  const router = useRouter();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.08] bg-black">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center sm:items-start gap-3">
          <NomosXLogo variant="wordmark" size={16} className="opacity-80" />
          <div>
          <p className="font-mono text-xs text-white/50 tracking-wide">
            © {year} {BRAND_NAME}
          </p>
          <p className="font-mono text-[11px] text-white/40 tracking-wide mt-2">
            {BRAND_TAGLINE}
          </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => router.push(link.href)}
              className="font-mono text-xs text-white/50 hover:text-white transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>
      </div>
    </footer>
  );
}
