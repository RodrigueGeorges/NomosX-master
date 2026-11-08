/**
 * Seed Think Tank verticals into local DB (idempotent)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-32chars-min";
}

import { prisma } from "../lib/db";
import { VERTICALS } from "../lib/think-tank/verticals";

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
