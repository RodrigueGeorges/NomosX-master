import { Metadata } from "next";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy | NomosX",
  description: "NomosX Privacy Policy — how we collect, use, and protect your data",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <LegalPageShell>{children}</LegalPageShell>;
}
