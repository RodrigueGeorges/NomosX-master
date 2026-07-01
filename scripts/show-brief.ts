import { config } from 'dotenv';
config({ path: '.env.local' });
config();

async function main() {
  const { prisma } = await import('../lib/db');
  const brief = await prisma.brief.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { pipelineRun: true, topic: true },
  });

  if (!brief) {
    console.log('No brief found');
    return;
  }

  console.log('=== BRIEF ===');
  console.log('ID:', brief.id);
  console.log('Kind:', brief.kind);
  console.log('Question:', brief.question);
  console.log('TrustScore:', brief.trustScore);
  console.log('QualityScore:', brief.qualityScore);
  console.log('CreatedAt:', brief.createdAt);
  console.log('PublishedAt:', brief.publishedAt ?? 'not published');
  console.log('PublicId:', brief.publicId ?? 'none');
  console.log('HTML length:', brief.html?.length ?? 0);
  console.log('Sources (IDs):', brief.sources?.length ?? 0);
  console.log('PipelineRunId:', brief.pipelineRunId ?? 'none');

  if (brief.pipelineRun) {
    console.log('\n=== PIPELINE RUN ===');
    console.log('ID:', brief.pipelineRun.id);
    console.log('Status:', brief.pipelineRun.status);
    console.log('Format:', brief.pipelineRun.format);
    console.log('Cost USD:', brief.pipelineRun.costUsd);
    console.log('Duration ms:', brief.pipelineRun.durationMs);
    console.log('Error:', brief.pipelineRun.error ?? 'none');
  }

  // Fetch source details
  if (brief.sources && brief.sources.length > 0) {
    const sourceRecords = await prisma.source.findMany({
      where: { id: { in: brief.sources } },
      select: { id: true, title: true, provider: true, qualityScore: true, year: true, doi: true, authors: true },
    });
    console.log('\n=== SOURCES ===');
    for (const s of sourceRecords) {
      console.log(`  [${s.provider}] ${s.title?.slice(0, 80)} (quality=${s.qualityScore}, year=${s.year})`);
    }
  }

  // Extract text from HTML (strip tags for preview)
  if (brief.html) {
    const text = brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('\n=== PUBLICATION PREVIEW (first 2000 chars of text) ===');
    console.log(text.slice(0, 2000));

    // Save HTML to file
    const fs = await import('fs');
    const outPath = `scripts/output-latest.html`;
    fs.writeFileSync(outPath, brief.html, 'utf-8');
    console.log(`\n HTML saved to: ${outPath}`);
  }
}

main().catch(console.error);
