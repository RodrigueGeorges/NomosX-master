import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendTrialExpiryReminder, sendTrialExpired } from '@/lib/email';

/**
 * POST /api/cron/trial-reminders
 * 
 * Daily cron job to send trial expiry reminders:
 * - 7 days before expiry
 * - 3 days before expiry  
 * - 1 day before expiry
 * - On expiry day
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const results = {
      reminders7: 0,
      reminders3: 0,
      reminders1: 0,
      expired: 0,
      errors: [] as string[],
    };

    // Get users with trials expiring in 7 days
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const expiringIn7Days = await prisma.user.findMany({
      where: {
        subscription: {
          trialEnd: {
            gte: new Date(sevenDaysFromNow.setHours(0, 0, 0, 0)),
            lt: new Date(sevenDaysFromNow.setHours(23, 59, 59, 999)),
          },
          isTrialActive: true,
          plan: 'ANALYST',
        },
      },
      include: { subscription: true },
    });

    // Send 7-day reminders
    for (const user of expiringIn7Days) {
      try {
        await sendTrialExpiryReminder(user.email, user.name, 7);
        results.reminders7++;
      } catch (error) {
        console.error(`[Trial Reminders] Failed to send 7-day reminder to ${user.email}:`, error);
        results.errors.push(`7-day reminder failed for ${user.email}`);
      }
    }

    // Get users with trials expiring in 3 days
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const expiringIn3Days = await prisma.user.findMany({
      where: {
        subscription: {
          trialEnd: {
            gte: new Date(threeDaysFromNow.setHours(0, 0, 0, 0)),
            lt: new Date(threeDaysFromNow.setHours(23, 59, 59, 999)),
          },
          isTrialActive: true,
          plan: 'ANALYST',
        },
      },
      include: { subscription: true },
    });

    // Send 3-day reminders
    for (const user of expiringIn3Days) {
      try {
        await sendTrialExpiryReminder(user.email, user.name, 3);
        results.reminders3++;
      } catch (error) {
        console.error(`[Trial Reminders] Failed to send 3-day reminder to ${user.email}:`, error);
        results.errors.push(`3-day reminder failed for ${user.email}`);
      }
    }

    // Get users with trials expiring in 1 day
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    
    const expiringIn1Day = await prisma.user.findMany({
      where: {
        subscription: {
          trialEnd: {
            gte: new Date(oneDayFromNow.setHours(0, 0, 0, 0)),
            lt: new Date(oneDayFromNow.setHours(23, 59, 59, 999)),
          },
          isTrialActive: true,
          plan: 'ANALYST',
        },
      },
      include: { subscription: true },
    });

    // Send 1-day reminders
    for (const user of expiringIn1Day) {
      try {
        await sendTrialExpiryReminder(user.email, user.name, 1);
        results.reminders1++;
      } catch (error) {
        console.error(`[Trial Reminders] Failed to send 1-day reminder to ${user.email}:`, error);
        results.errors.push(`1-day reminder failed for ${user.email}`);
      }
    }

    // Get users with trials expiring today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const expiringToday = await prisma.user.findMany({
      where: {
        subscription: {
          trialEnd: {
            gte: todayStart,
            lt: todayEnd,
          },
          isTrialActive: true,
          plan: 'ANALYST',
        },
      },
      include: { subscription: true },
    });

    // Send expired notifications and deactivate trials
    for (const user of expiringToday) {
      try {
        await sendTrialExpired(user.email, user.name);
        
        // Deactivate the trial
        await prisma.subscription.update({
          where: { userId: user.id },
          data: { isTrialActive: false },
        });
        
        results.expired++;
      } catch (error) {
        console.error(`[Trial Reminders] Failed to send expired notification to ${user.email}:`, error);
        results.errors.push(`Expired notification failed for ${user.email}`);
      }
    }

    console.log('[Trial Reminders] Daily run completed:', results);

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Trial Reminders] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
