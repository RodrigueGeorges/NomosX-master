import { redirect } from "next/navigation";

export default async function PublicationRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/inquiry/${id}`);
}
