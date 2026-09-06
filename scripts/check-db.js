const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT 1 as test`.then(r => {
  console.log('DB OK:', JSON.stringify(r));
  process.exit(0);
}).catch(e => {
  console.error('DB ERROR:', e.message);
  process.exit(1);
});
