const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ThinkTankPublication" ADD COLUMN IF NOT EXISTS "tweetedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "tweetId" TEXT'
    );
    console.log("Migration applied: tweetedAt + tweetId");
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
