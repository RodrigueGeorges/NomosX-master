"use client";

import { useRouter } from "next/navigation";

const FOOTER_LINKS = [
  { label: "Inquiries", href: "/archives" },
  { label: "Research", href: "/researchers" },
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
    <footer className="border-t border-white/[0.06] bg-bg">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="font-mono text-[11px] text-white/30 tracking-wide">
          © {year} NomosX · Autonomous think tank
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => router.push(link.href)}
              className="font-mono text-[11px] text-white/35 hover:text-accent/80 transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>
      </div>
    </footer>
  );
}
