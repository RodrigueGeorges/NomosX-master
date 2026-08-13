import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pub = await prisma.publication.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      title: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      html: true,
    },
  });
  if (!pub) {
    console.log('No publication found');
    return;
  }
  console.log('=== Latest Publication ===');
  console.log('Title:', pub.title);
  console.log('Public ID:', pub.publicId);
  console.log('Trust:', pub.trustScore);
  console.log('Quality:', pub.qualityScore);
  console.log('Coverage:', pub.citationCoverage);
  console.log('HTML length:', pub.html?.length || 0);

  const html = pub.html || '';
  const nonEtablieCount = (html.match(/non établie/g) || []).length;
  const nonVerifieCount = (html.match(/Non vérifié/g) || []).length;
  const unknownAuthorCount = (html.match(/Unknown Author/g) || []).length;
  const doiNonEtablie = (html.match(/doi\.org\/non/g) || []).length;
  const dupCitations = (html.match(/\[E\d+\]E\d+/g) || []).length;
  const electricityData = (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length;

  console.log('\n=== Issue Checks ===');
  console.log('"non établie" occurrences:', nonEtablieCount);
  console.log('"Non vérifié" occurrences:', nonVerifieCount);
  console.log('"Unknown Author" occurrences:', unknownAuthorCount);
  console.log('DOIs with "non établie":', doiNonEtablie);
  console.log('Duplicate citations [E4]E4:', dupCitations);
  console.log('Electricity data (off-topic):', electricityData);

  // Show a sample of the key findings section
  const keyFindingsIdx = html.indexOf('Key Findings');
  if (keyFindingsIdx > 0) {
    console.log('\n=== Key Findings Sample ===');
    console.log(html.slice(keyFindingsIdx, keyFindingsIdx + 2000));
  }

  // Show a sample of the sources section
  const sourcesIdx = html.indexOf('class="source-item"');
  if (sourcesIdx > 0) {
    console.log('\n=== First Source Entry ===');
    console.log(html.slice(sourcesIdx - 50, sourcesIdx + 500));
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
