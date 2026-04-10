/**
 * NomosX Cadence Enforcer Agent
 * 
 * Checks and enforces publication rate limits
 * Part of the Institutional Think Tank pipeline
 */

import { prisma } from '@/lib/db';
import { CadenceResult,GLOBAL_CADENCE,VerticalConfig } from '@/lib/think-tank/types';

// ============================================================================
// TYPES
// ============================================================================

interface CadenceEnforcerInput {
  verticalId: string;
  timestamp?: Date;
  isEmergency?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function isQuietHours(date: Date): boolean {
  const hour = date.getUTCHours();
  return hour >= GLOBAL_CADENCE.quietHoursStart || hour < GLOBAL_CADENCE.quietHoursEnd;
}

function getNextPublishWindow(date: Date): Date {
  const result = new Date(date);
  const currentHour = result.getUTCHours();
  
  // Find next publish window
  const windows = GLOBAL_CADENCE.publishWindows;
  let nextWindow = windows.find(w => w > currentHour);
  
  if (!nextWindow) {
    // Next day, first window
    result.setUTCDate(result.getUTCDate() + 1);
    nextWindow = windows[0];
  }
  
  result.setUTCHours(nextWindow, 0, 0, 0);
  return result;
}

// ============================================================================
// COUNTER MANAGEMENT
// ============================================================================

async function getOrCreateCounter(
  verticalId: string | null,
  windowType: "DAILY" | "WEEKLY",
  windowStart: Date,
  windowEnd: Date,
  maxAllowed: number
): Promise<{ count: number; max: number }> {
  let counter = await prisma.cadenceCounter.findFirst({
    where: {
      verticalId,
      windowType,
      windowStart
    }
  });
  
  if (!counter) {
    counter = await prisma.cadenceCounter.create({
      data: {
        verticalId,
        windowType,
        windowStart,
        windowEnd,
        count: 0,
        maxAllowed
      }
    });
  }
  
  return { count: counter.count, max: counter.maxAllowed };
}

async function incrementCounter(
  verticalId: string | null,
  windowType: "DAILY" | "WEEKLY",
  windowStart: Date
): Promise<void> {
  await prisma.cadenceCounter.updateMany({
    where: {
      verticalId,
      windowType,
      windowStart
    },
    data: {
      count: { increment: 1 }
    }
  });
}

// ============================================================================
// MAIN ENFORCER
// ============================================================================

export async function cadenceEnforcer(input: CadenceEnforcerInput): Promise<CadenceResult> {
  const timestamp = input.timestamp || new Date();
  console.log(`[CADENCE_ENFORCER] Checking cadence for vertical ${input.verticalId} at ${timestamp.toISOString()}`);
  
  // Get vertical config
  const vertical = await prisma.vertical.findUnique({
    where: { id: input.verticalId }
  });
  
  if (!vertical) {
    return {
      allowed: false,
      reason: `Vertical ${input.verticalId} not found`,
      counters: {
        globalDaily: { current: 0, max: GLOBAL_CADENCE.maxPerDay },
        globalWeekly: { current: 0, max: GLOBAL_CADENCE.maxPerWeek },
        verticalWeekly: { current: 0, max: 0 }
      }
    };
  }
  
  const config = vertical.config as unknown as VerticalConfig;
  
  // Time windows
  const dayStart = getStartOfDay(timestamp);
  const dayEnd = getEndOfDay(timestamp);
  const weekStart = getStartOfWeek(timestamp);
  const weekEnd = getEndOfWeek(timestamp);
  
  // Get counters
  const globalDaily = await getOrCreateCounter(
    null, "DAILY", dayStart, dayEnd, GLOBAL_CADENCE.maxPerDay
  );
  
  const globalWeekly = await getOrCreateCounter(
    null, "WEEKLY", weekStart, weekEnd, GLOBAL_CADENCE.maxPerWeek
  );
  
  const verticalWeekly = await getOrCreateCounter(
    input.verticalId, "WEEKLY", weekStart, weekEnd, config.maxPublicationsPerWeek
  );
  
  const counters = {
    globalDaily: { current: globalDaily.count, max: globalDaily.max },
    globalWeekly: { current: globalWeekly.count, max: globalWeekly.max },
    verticalWeekly: { current: verticalWeekly.count, max: verticalWeekly.max }
  };
  
  // Check 1: Quiet hours (unless emergency)
  if (!input.isEmergency && isQuietHours(timestamp)) {
    const nextWindow = getNextPublishWindow(timestamp);
    return {
      allowed: false,
      reason: `Quiet hours (${GLOBAL_CADENCE.quietHoursStart}:00-${GLOBAL_CADENCE.quietHoursEnd}:00 UTC)`,
      nextWindowAt: nextWindow,
      counters
    };
  }
  
  // Check 2: Global daily limit
  if (globalDaily.count >= globalDaily.max) {
    const tomorrow = new Date(dayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(GLOBAL_CADENCE.publishWindows[0], 0, 0, 0);
    
    return {
      allowed: false,
      reason: `Global daily limit reached (${globalDaily.count}/${globalDaily.max})`,
      nextWindowAt: tomorrow,
      counters
    };
  }
  
  // Check 3: Global weekly limit
  if (globalWeekly.count >= globalWeekly.max) {
    const nextWeek = new Date(weekEnd);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 1);
    nextWeek.setUTCHours(GLOBAL_CADENCE.publishWindows[0], 0, 0, 0);
    
    return {
      allowed: false,
      reason: `Global weekly limit reached (${globalWeekly.count}/${globalWeekly.max})`,
      nextWindowAt: nextWeek,
      counters
    };
  }
  
  // Check 4: Vertical weekly limit
  if (verticalWeekly.count >= verticalWeekly.max) {
    const nextWeek = new Date(weekEnd);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 1);
    nextWeek.setUTCHours(GLOBAL_CADENCE.publishWindows[0], 0, 0, 0);
    
    return {
      allowed: false,
      reason: `Vertical weekly limit reached (${verticalWeekly.count}/${verticalWeekly.max})`,
      nextWindowAt: nextWeek,
      counters
    };
  }
  
  // Check 5: Cooldown since last publication in this vertical
  const lastPublication = await prisma.thinkTankPublication.findFirst({
    where: {
      verticalId: input.verticalId,
      publishedAt: { not: null }
    },
    orderBy: { publishedAt: "desc" }
  });
  
  if (lastPublication?.publishedAt) {
    const hoursSinceLast = (timestamp.getTime() - lastPublication.publishedAt.getTime()) / (1000 * 60 * 60);
    const cooldownRemaining = config.cooldownHours - hoursSinceLast;
    
    if (cooldownRemaining > 0 && !input.isEmergency) {
      const nextAllowed = new Date(lastPublication.publishedAt.getTime() + config.cooldownHours * 60 * 60 * 1000);
      
      return {
        allowed: false,
        reason: `Cooldown active (${Math.round(cooldownRemaining)}h remaining)`,
        nextWindowAt: nextAllowed,
        counters,
        cooldownRemaining: Math.round(cooldownRemaining)
      };
    }
  }
  
  // All checks passed
  console.log(`[CADENCE_ENFORCER] ✅ Publication allowed`);
  return {
    allowed: true,
    counters
  };
}

// ============================================================================
// INCREMENT AFTER PUBLICATION
// ============================================================================

export async function recordPublication(verticalId: string): Promise<void> {
  const now = new Date();
  const dayStart = getStartOfDay(now);
  const weekStart = getStartOfWeek(now);
  
  // Increment global daily
  await incrementCounter(null, "DAILY", dayStart);
  
  // Increment global weekly
  await incrementCounter(null, "WEEKLY", weekStart);
  
  // Increment vertical weekly
  await incrementCounter(verticalId, "WEEKLY", weekStart);
  
  console.log(`[CADENCE_ENFORCER] Recorded publication for vertical ${verticalId}`);
}

// ============================================================================
// RESET COUNTERS (for scheduled job)
// ============================================================================

export async function resetDailyCounters(): Promise<number> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  
  const result = await prisma.cadenceCounter.deleteMany({
    where: {
      windowType: "DAILY",
      windowEnd: { lt: yesterday }
    }
  });
  
  console.log(`[CADENCE_ENFORCER] Reset ${result.count} expired daily counters`);
  return result.count;
}

export async function resetWeeklyCounters(): Promise<number> {
  const lastWeek = new Date();
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  
  const result = await prisma.cadenceCounter.deleteMany({
    where: {
      windowType: "WEEKLY",
      windowEnd: { lt: lastWeek }
    }
  });
  
  console.log(`[CADENCE_ENFORCER] Reset ${result.count} expired weekly counters`);
  return result.count;
}
