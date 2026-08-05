import { fetchInquiryData } from "@/lib/queries/public-inquiry";
import { InquiryClient, InquiryNotFound } from "@/components/inquiry/InquiryClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function InquiryPage({ params }: PageProps) {
  const { slug } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return <InquiryNotFound />;
  }

  const { inquiry, related } = await fetchInquiryData(slug);

  if (!inquiry) {
    return <InquiryNotFound />;
  }

  return <InquiryClient inquiry={inquiry} related={related} />;
}
