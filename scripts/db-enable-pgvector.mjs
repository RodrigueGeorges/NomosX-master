// Enable pgvector extension (optional) for future semantic search at DB-level
// Usage:
//   node .\scripts\db-enable-pgvector.mjs
//
// Requires DATABASE_URL in .env and sufficient DB privileges.

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../generated/prisma-client/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("[pgvector] Enabling extension...");
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  console.log("[pgvector] ✅ vector extension enabled");

  console.log("[pgvector] NOTE: Prisma schema currently stores embeddings in Float[] (JSON).\n" +
    "To use pgvector fully, add a vector column and create an IVFFLAT/HNSW index via SQL, and query via raw SQL.");
}

main()
  .catch((e) => {
    console.error("[pgvector] Failed:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
