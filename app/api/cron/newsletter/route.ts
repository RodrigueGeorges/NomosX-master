/**
 * Newsletter Cron Endpoint
 * 
 * Triggered by Vercel Cron or external scheduler.
 * Schedule: Every Monday at 8:00 AM UTC
 * 
 * vercel.json config:
 * {
 *   "crons": [{
 *     "path": "/api/cron/newsletter",
 *     "schedule": "0 8 * * 1"
 *   }]
 * }
 */

import { NextRequest,NextResponse } from 'next/server';
import { runWeeklyNewsletter } from '@/lib/jobs/weekly-newsletter';
import { sendBulkNewsletter } from '@/lib/email';
import { prisma } from '@/lib/db';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Verify authorization
  const authHeader = req.headers.get("authorization");
  
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    console.log("[Cron/Newsletter] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron/Newsletter] Starting weekly newsletter job...");

  try {
    // 1. Generate newsletter edition
    const result = await runWeeklyNewsletter();

    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Failed to generate newsletter" 
      }, { status: 500 });
    }

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: result.reason,
      });
    }

    // 2. Get edition and subscribers
    const edition = await prisma.newsletterEdition.findUnique({
      where: { id: result.editionId },
    });

    if (!edition) {
      return NextResponse.json({ 
        success: false, 
        error: "Edition not found" 
      }, { status: 500 });
    }

    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { status: "active" },
      select: { id: true, email: true },
    });

    if (subscribers.length === 0) {
      console.log("[Cron/Newsletter] No active subscribers, skipping send");
      return NextResponse.json({
        success: true,
        editionId: edition.id,
        editionNumber: edition.editionNumber,
        subscriberCount: 0,
        sent: 0,
        status: "no_subscribers",
      });
    }

    // 3. Send emails
    console.log(`[Cron/Newsletter] Sending to ${subscribers.length} subscribers...`);
    
    const sendResult = await sendBulkNewsletter(
      subscribers,
      edition.subject,
      edition.html,
      { batchSize: 50, delayMs: 200 }
    );

    // 4. Update edition stats
    await prisma.newsletterEdition.update({
      where: { id: edition.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        recipientCount: subscribers.length,
      },
    });

    // 5. Update subscriber stats
    await prisma.newsletterSubscriber.updateMany({
      where: { 
        id: { in: subscribers.map(s => s.id) },
        status: "active"
      },
      data: {
        lastEmailSentAt: new Date(),
        emailsSent: { increment: 1 },
      },
    });

    console.log("[Cron/Newsletter] Job completed successfully");

    // Record cron run for health monitoring
    const now = new Date();
    prisma.systemMetric.create({
      data: {
        metricName: 'cron.newsletter',
        metricValue: sendResult.sent,
        unit: 'count',
        periodStart: now,
        periodEnd: now,
        dimensions: { sent: sendResult.sent, failed: sendResult.failed },
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      editionId: edition.id,
      editionNumber: edition.editionNumber,
      briefCount: result.briefCount,
      subscriberCount: subscribers.length,
      sent: sendResult.sent,
      failed: sendResult.failed,
      status: "sent",
    });

  } catch (error) {
    console.error("[Cron/Newsletter] Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req);
}
