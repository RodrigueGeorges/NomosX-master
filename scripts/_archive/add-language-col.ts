import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  await prisma.$executeRaw`ALTER TABLE "ThinkTankPublication" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en'`;
  console.log('Column language added successfully');
  await prisma.$disconnect();
})().catch(e => console.error(e));
