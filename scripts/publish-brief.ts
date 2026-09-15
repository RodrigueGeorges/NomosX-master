import { prisma } from '../lib/db';

async function main() {
  const briefId = process.argv[2];
  if (!briefId) {
    console.error('Usage: node --import tsx scripts/publish-brief.ts <briefId>');
    process.exit(1);
  }

  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) {
    console.error('Brief not found:', briefId);
    process.exit(1);
  }

  const slug = brief.question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 70)
    .replace(/-+$/, '') + '-v2';

  const updated = await prisma.brief.update({
    where: { id: briefId },
    data: {
      publishedAt: new Date(),
      publicId: slug,
    },
  });

  console.log('Published:', updated.id);
  console.log('publicId:', updated.publicId);
  console.log('publishedAt:', updated.publishedAt);
  console.log('URL: /inquiry/' + slug);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
