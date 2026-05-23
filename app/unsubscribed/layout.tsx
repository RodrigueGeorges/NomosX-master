"use client";

import { LegalPageShell } from "@/components/layout/LegalPageShell";

export default function UnsubscribedLayout({ children }: { children: React.ReactNode }) {
  return <LegalPageShell>{children}</LegalPageShell>;
}
