import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const verticals = await p.vertical.findMany({ select: { slug: true, name: true, isActive: true } });
  console.log('Verticals:', JSON.stringify(verticals, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
}
await p.$disconnect();
