/**
 * Agent Governance Layer - Editorial Rules
 * 
 * Enforces editorial discipline and cadence limits.
 * These rules ensure NomosX maintains institutional-grade quality.
 * 
 * Principle: Silence is a success state.
 * 
 * ⚠️ INTERNAL ONLY - Never expose to UI or marketing
 */

import { prisma } from '../db';
import { logAuditEvent } from './audit';

/**
 * Editorial cadence violation error
 */
export class CadenceViolationError extends Error {
  constructor(
    public readonly current: number,
    public readonly limit: number,
    public readonly period: string
  ) {
    super(
      `Editorial cadence exceeded: ${current}/${limit} publications this ${period}`
    );
    this.name = "CadenceViolationError";
  }
}

/**
 * Editorial cadence configuration
 */
export const CADENCE_LIMITS = {
  WEEKLY_MAX: 3,
  MONTHLY_MAX: 12,
  DAILY_MAX: 1
} as const;

/**
 * Get publication count for a time period
 */
async function getPublicationCount(
  startDate: Date,
  endDate: Date
): Promise<number> {
  return await prisma.draft.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: "PUBLISHED"
    }
  });
}

/**
 * Enforce weekly publication cadence limit
 * 
 * @throws {CadenceViolationError} if limit exceeded
 */
export async function enforceCadenceLimit(): Promise<void> {
  // Get current week boundaries (Monday to Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  // Count publications this week
  const weeklyCount = await getPublicationCount(monday, sunday);
  
  if (weeklyCount >= CADENCE_LIMITS.WEEKLY_MAX) {
    // Log the violation
    await logAuditEvent({
      agent: "publisher",
      action: "CADENCE_EXCEEDED",
      resource: "weekly_limit",
      metadata: {
        current: weeklyCount,
        limit: CADENCE_LIMITS.WEEKLY_MAX,
        period: "week"
      }
    });
    
    throw new CadenceViolationError(
      weeklyCount,
      CADENCE_LIMITS.WEEKLY_MAX,
      "week"
    );
  }
}

/**
 * Enforce daily publication cadence limit
 * 
 * @throws {CadenceViolationError} if limit exceeded
 */
export async function enforceDailyCadenceLimit(): Promise<void> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  
  const dailyCount = await getPublicationCount(startOfDay, endOfDay);
  
  if (dailyCount >= CADENCE_LIMITS.DAILY_MAX) {
    await logAuditEvent({
      agent: "publisher",
      action: "CADENCE_EXCEEDED",
      resource: "daily_limit",
      metadata: {
        current: dailyCount,
        limit: CADENCE_LIMITS.DAILY_MAX,
        period: "day"
      }
    });
    
    throw new CadenceViolationError(
      dailyCount,
      CADENCE_LIMITS.DAILY_MAX,
      "day"
    );
  }
}

/**
 * Check if publication is allowed without throwing
 */
export async function canPublish(): Promise<{
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}> {
  try {
    await enforceCadenceLimit();
    await enforceDailyCadenceLimit();
    return { allowed: true };
  } catch (error) {
    if (error instanceof CadenceViolationError) {
      return {
        allowed: false,
        reason: error.message,
        current: error.current,
        limit: error.limit
      };
    }
    throw error;
  }
}

/**
 * Get current cadence status (for internal monitoring)
 */
export async function getCadenceStatus(): Promise<{
  daily: { current: number; limit: number; remaining: number };
  weekly: { current: number; limit: number; remaining: number };
}> {
  const now = new Date();
  
  // Daily
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const dailyCount = await getPublicationCount(startOfDay, endOfDay);
  
  // Weekly
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const weeklyCount = await getPublicationCount(monday, sunday);
  
  return {
    daily: {
      current: dailyCount,
      limit: CADENCE_LIMITS.DAILY_MAX,
      remaining: Math.max(0, CADENCE_LIMITS.DAILY_MAX - dailyCount)
    },
    weekly: {
      current: weeklyCount,
      limit: CADENCE_LIMITS.WEEKLY_MAX,
      remaining: Math.max(0, CADENCE_LIMITS.WEEKLY_MAX - weeklyCount)
    }
  };
}
