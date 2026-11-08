require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Update the publication with correct type (uppercase)
  const pub = await p.thinkTankPublication.updateMany({
    where: { publicId: 'cmsths8rq01sohqgoo7t4lv9u' },
    data: {
      type: 'STRATEGIC_REPORT',
    }
  });
  console.log('Updated', pub.count, 'publication(s) to STRATEGIC_REPORT');

  // Verify
  const verify = await p.thinkTankPublication.findFirst({
    where: { publicId: 'cmsths8rq01sohqgoo7t4lv9u' },
    select: { id: true, publicId: true, title: true, type: true, status: true, trustScore: true, qualityScore: true, citationCoverage: true, wordCount: true }
  });
  console.log('Verified:', JSON.stringify(verify, null, 2));
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
