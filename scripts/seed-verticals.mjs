#!/usr/bin/env node
/**
 * Seed Think Tank verticals into DB (idempotent)
 *
 * PowerShell:
 *   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
 *   node --import tsx .\scripts\seed-verticals.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-32chars-min";
}
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "dev-openai-key";
}

import { prisma } from "../lib/db.ts";
import { VERTICALS } from "../lib/think-tank/verticals.ts";

(async () => {
  const existing = await prisma.vertical.findMany({ select: { slug: true } });
  const existingSlugs = new Set(existing.map((v) => v.slug));

  let created = 0;
  for (const v of VERTICALS) {
    if (existingSlugs.has(v.slug)) continue;

    await prisma.vertical.create({
      data: {
        slug: v.slug,
        name: v.name,
        nameEn: v.nameEn,
        description: v.description,
        icon: v.icon,
        color: v.color,
        config: v.config as any,
        isActive: true,
      },
    });
    created += 1;
  }

  console.log(`[seed-verticals] created=${created} existing=${existing.length}`);
  process.exit(0);
})().catch((e) => {
  console.error("seed-verticals failed:", e?.message || e);
  process.exit(1);
});
