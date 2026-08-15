import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  const counts = {
    brief: await prisma.brief.count(),
    pub: await prisma.thinkTankPublication.count(),
    run: await prisma.pipelineRun.count(),
    source: await prisma.source.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
})();
