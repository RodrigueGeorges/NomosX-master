/**
 * User quota enforcement.
 *
 * P0: enforce max runs/day + blocked status.
 *
 * NOTE: For strict cost control, we should also track estimatedCostUsd per run.
 */

import { prisma } from '../db';

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export async function assertAndConsumeRun(userId: string): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    let quota = await tx.userQuota.findUnique({ where: { userId } });

    if (!quota) {
      quota = await tx.userQuota.create({ data: { userId } });
    }

    // Resets
    const needsDailyReset = !isSameDay(quota.lastDailyReset, now);
    const needsMonthlyReset = !isSameMonth(quota.lastMonthlyReset, now);

    if (needsDailyReset || needsMonthlyReset) {
      quota = await tx.userQuota.update({
        where: { userId },
        data: {
          runsToday: needsDailyReset ? 0 : quota.runsToday,
          lastDailyReset: needsDailyReset ? now : quota.lastDailyReset,

          runsThisMonth: needsMonthlyReset ? 0 : quota.runsThisMonth,
          costThisMonth: needsMonthlyReset ? 0 : quota.costThisMonth,
          lastMonthlyReset: needsMonthlyReset ? now : quota.lastMonthlyReset,
        },
      });
    }

    if (quota.isBlocked) {
      throw new QuotaError(quota.blockReason || "Account is blocked");
    }

    if (quota.runsToday >= quota.maxRunsPerDay) {
      throw new QuotaError(`Daily run limit reached (${quota.maxRunsPerDay}/day)`);
    }

    // Consume
    await tx.userQuota.update({
      where: { userId },
      data: {
        runsToday: { increment: 1 },
        runsThisMonth: { increment: 1 },
      },
    });
  });
}
