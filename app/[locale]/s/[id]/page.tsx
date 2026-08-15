import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationInLocale } from '@/lib/agent/translation-service';
import { setRequestLocale } from 'next-intl/server';
import { SharedBriefClient } from './SharedBriefClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  const brief = await prisma.thinkTankPublication.findFirst({
    where: publicPublicationWhere({ OR: [{ publicId: id }, { id }] }),
    select: { id: true, title: true, html: true, language: true },
  });

  let title = 'Shared Brief — NomosX';
  let description = 'Intelligence brief published by NomosX.';

  if (brief) {
    let html = brief.html;
    let briefTitle = brief.title;

    // Get translated version if needed
    if (locale !== 'en' && locale !== (brief.language || 'en')) {
      const translated = await getPublicationInLocale(brief.id, locale);
      if (translated) {
        briefTitle = translated.title;
        html = translated.html;
      }
    }

    title = briefTitle ? `${briefTitle} — NomosX` : title;
    if (html) {
      const firstP = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (firstP) {
        description = firstP[1].replace(/<[^>]*>/g, '').replace(/\[SRC-\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || description;
      }
    }
  }

  return { title, description };
}

export default async function SharedBrief({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  setRequestLocale(locale);

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
      language: true,
    },
  });
  if (!brief) notFound();

  // Get translated version if needed
  let briefData: { title: string; html: string } = { title: brief.title, html: brief.html };
  if (locale !== 'en' && locale !== (brief.language || 'en')) {
    const translated = await getPublicationInLocale(brief.id, locale);
    if (translated) {
      briefData = { title: translated.title, html: translated.html };
    }
  }

  return <SharedBriefClient brief={{
    ...brief,
    title: briefData.title,
    html: briefData.html,
  }} />;
}
