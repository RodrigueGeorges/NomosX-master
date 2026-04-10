/**
 * NomosX Think Tank - Verticals API
 * 
 * GET /api/think-tank/verticals - List all verticals
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Auth protection
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verticals = await prisma.vertical.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            signals: { where: { status: "NEW" } },
            publications: { where: { publishedAt: { not: null } } }
          }
        }
      }
    });

    // Get cadence info for each vertical
    const now = new Date();
    const weekStart = getStartOfWeek(now);

    const verticalsWithCadence = await Promise.all(
      verticals.map(async (v) => {
        const counter = await prisma.cadenceCounter.findFirst({
          where: {
            verticalId: v.id,
            windowType: "WEEKLY",
            windowStart: weekStart
          }
        });

        const config = v.config as any;

        return {
          id: v.id,
          slug: v.slug,
          name: v.name,
          nameEn: v.nameEn,
          description: v.description,
          icon: v.icon,
          color: v.color,
          pendingSignals: v._count.signals,
          publishedCount: v._count.publications,
          cadence: {
            current: counter?.count || 0,
            max: config?.maxPublicationsPerWeek || 5
          }
        };
      })
    );

    return NextResponse.json({ verticals: verticalsWithCadence });
  } catch (error: any) {
    console.error("[API] Verticals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
