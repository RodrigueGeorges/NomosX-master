/**
 * POST /api/admin/seed-verticals — idempotent upsert of the canonical
 * vertical definitions (lib/think-tank/verticals.ts) into the Vertical
 * table. Needed because `prisma db push` can't run against prod from a dev
 * machine — same pattern as /api/admin/migrate-predictions. Guarded by
 * ADMIN_KEY. Safe to call repeatedly: existing slugs are updated in place,
 * missing ones are created.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { VERTICALS } from '@/lib/think-tank/verticals';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: Array<{ slug: string; action: string }> = [];
  for (const v of VERTICALS) {
    try {
      const existing = await prisma.vertical.findUnique({ where: { slug: v.slug }, select: { id: true } });
      const data = {
        name: v.name,
        nameEn: v.nameEn,
        description: v.description,
        icon: v.icon,
        color: v.color,
        config: v.config as object,
        isActive: true,
      };
      if (existing) {
        await prisma.vertical.update({ where: { slug: v.slug }, data });
        results.push({ slug: v.slug, action: 'updated' });
      } else {
        await prisma.vertical.create({
          data: { slug: v.slug, ...data },
        });
        results.push({ slug: v.slug, action: 'created' });
      }
    } catch (err) {
      results.push({
        slug: v.slug,
        action: `fail: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      });
    }
  }
  return NextResponse.json({ total: VERTICALS.length, results });
}
