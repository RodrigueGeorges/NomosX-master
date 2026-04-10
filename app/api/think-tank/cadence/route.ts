/**
 * NomosX Think Tank - Cadence API
 * 
 * GET /api/think-tank/cadence - Get current cadence status
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { GLOBAL_CADENCE } from '@/lib/think-tank/types';

export async function GET(request: NextRequest) {
  try {
    // Auth protection
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const dayStart = getStartOfDay(now);
    const weekStart = getStartOfWeek(now);

    // Get global counters
    const [globalDaily, globalWeekly] = await Promise.all([
      prisma.cadenceCounter.findFirst({
        where: { verticalId: null, windowType: "DAILY", windowStart: dayStart }
      }),
      prisma.cadenceCounter.findFirst({
        where: { verticalId: null, windowType: "WEEKLY", windowStart: weekStart }
      })
    ]);

    // Get vertical counters
    const verticalCounters = await prisma.cadenceCounter.findMany({
      where: {
        verticalId: { not: null },
        windowType: "WEEKLY",
        windowStart: weekStart
      },
      include: {
        vertical: {
          select: { id: true, slug: true, name: true, icon: true, config: true }
        }
      }
    });

    // Get next publish window
    const nextWindow = getNextPublishWindow(now);
    const isQuietHours = checkQuietHours(now);

    return NextResponse.json({
      global: {
        daily: {
          current: globalDaily?.count || 0,
          max: GLOBAL_CADENCE.maxPerDay
        },
        weekly: {
          current: globalWeekly?.count || 0,
          max: GLOBAL_CADENCE.maxPerWeek
        }
      },
      verticals: verticalCounters.map(c => ({
        verticalId: c.verticalId,
        vertical: c.vertical,
        current: c.count,
        max: (c.vertical?.config as any)?.maxPublicationsPerWeek || 5
      })),
      nextPublishWindow: nextWindow,
      isQuietHours,
      quietHours: {
        start: GLOBAL_CADENCE.quietHoursStart,
        end: GLOBAL_CADENCE.quietHoursEnd
      },
      publishWindows: GLOBAL_CADENCE.publishWindows
    });
  } catch (error: any) {
    console.error("[API] Cadence error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function checkQuietHours(date: Date): boolean {
  const hour = date.getUTCHours();
  return hour >= GLOBAL_CADENCE.quietHoursStart || hour < GLOBAL_CADENCE.quietHoursEnd;
}

function getNextPublishWindow(date: Date): Date {
  const result = new Date(date);
  const currentHour = result.getUTCHours();
  
  const windows = GLOBAL_CADENCE.publishWindows;
  let nextWindow = windows.find(w => w > currentHour);
  
  if (!nextWindow) {
    result.setUTCDate(result.getUTCDate() + 1);
    nextWindow = windows[0];
  }
  
  result.setUTCHours(nextWindow, 0, 0, 0);
  return result;
}
