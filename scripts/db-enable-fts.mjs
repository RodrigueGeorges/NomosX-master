// Enable basic Postgres Full-Text Search index for Source(title, abstract)
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node .\scripts\db-enable-fts.mjs
//
// Requires DATABASE_URL in .env

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../generated/prisma-client/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("[FTS] Enabling FTS index on Source(title, abstract)...");

  // Note: We cannot add a generated tsvector column via Prisma easily here.
  // Instead we create an expression GIN index.
  // This index supports the query used in lib/embeddings.ts when ENABLE_PG_FTS=1.
  const sql = `
    CREATE INDEX IF NOT EXISTS source_fts_gin
    ON "Source"
    USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')));
  `;

  await prisma.$executeRawUnsafe(sql);

  console.log("[FTS] ✅ Index created: source_fts_gin");
  console.log("[FTS] To enable usage, set ENABLE_PG_FTS=1");
}

main()
  .catch((e) => {
    console.error("[FTS] Failed:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
