import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { SharedBriefClient } from './SharedBriefClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await prisma.thinkTankPublication.findFirst({
    where: publicPublicationWhere({ OR: [{ publicId: id }, { id }] }),
    select: { title: true, html: true },
  });

  let description = 'Intelligence brief published by the NomosX autonomous think tank.';
  if (brief?.html) {
    const firstP = brief.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (firstP) {
      description = firstP[1].replace(/<[^>]*>/g, '').replace(/\[SRC-\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || description;
    }
  }

  return {
    title: brief?.title ? `${brief.title} — NomosX` : 'Shared Brief — NomosX',
    description,
  };
}

export default async function SharedBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await prisma.thinkTankPublication.findFirst({
    where: publicPublicationWhere({ OR: [{ publicId: id }, { id }] }),
    select: {
      id: true,
      title: true,
      html: true,
      type: true,
      publishedAt: true,
      sourceIds: true,
      trustScore: true,
      wordCount: true,
    },
  });
  if (!brief) notFound();

  return <SharedBriefClient brief={brief} />;
}
