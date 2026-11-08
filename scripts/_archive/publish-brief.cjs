require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.update({
    where: { id: 'cmsths8rq01sohqgoo7t4lv9u' },
    data: { publicId: 'cmsths8rq01sohqgoo7t4lv9u', publishedAt: new Date() }
  });
  console.log('Published:', b.publicId, 'at', b.publishedAt);
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
