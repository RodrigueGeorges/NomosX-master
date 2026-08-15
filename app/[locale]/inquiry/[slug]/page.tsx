import { fetchInquiryData } from "@/lib/queries/public-inquiry";
import { InquiryClient, InquiryNotFound } from "@/components/inquiry/InquiryClient";
import { setRequestLocale } from "next-intl/server";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function InquiryPage({ params }: PageProps) {
  const { slug, locale } = await params;

  // Enable static rendering for this locale
  setRequestLocale(locale);

  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return <InquiryNotFound />;
  }

  const { inquiry, related } = await fetchInquiryData(slug, locale);

  if (!inquiry) {
    return <InquiryNotFound />;
  }

  return <InquiryClient inquiry={inquiry} related={related} />;
}
