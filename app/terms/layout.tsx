import { Metadata } from "next";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service | NomosX",
  description: "NomosX Terms of Service",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <LegalPageShell>{children}</LegalPageShell>;
}
