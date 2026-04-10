/**
 * Newsletter Confirm API
 * GET /api/newsletter/confirm?token=xxx
 * Activates a pending newsletter subscription via double opt-in link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendNewsletterWelcome } from '@/lib/email';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/?newsletter=invalid', req.url));
  }

  // Rate limit: 10 confirm attempts per hour per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  try {
    assertRateLimit(`newsletter:confirm:${ip}`, 10, 60 * 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.redirect(new URL('/?newsletter=invalid', req.url));
    }
    throw err;
  }

  try {
    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { confirmToken: token },
    });

    if (!subscriber) {
      return NextResponse.redirect(new URL('/?newsletter=invalid', req.url));
    }

    if (subscriber.status === 'active') {
      return NextResponse.redirect(new URL('/?newsletter=confirmed', req.url));
    }

    if (subscriber.status !== 'pending') {
      return NextResponse.redirect(new URL('/?newsletter=invalid', req.url));
    }

    // Check 48h TTL — token expires if subscriber was created > 48h ago
    const age = Date.now() - new Date(subscriber.createdAt).getTime();
    if (age > TOKEN_TTL_MS) {
      console.log(`[Newsletter] Expired token for ${subscriber.email}`);
      return NextResponse.redirect(new URL('/?newsletter=expired', req.url));
    }

    // Activate subscription
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: 'active',
        confirmedAt: new Date(),
      },
    });

    // Send welcome email (non-blocking)
    sendNewsletterWelcome(subscriber.email).catch(err =>
      console.error('[Newsletter] Welcome email failed:', err)
    );

    console.log(`[Newsletter] Confirmed: ${subscriber.email}`);

    return NextResponse.redirect(new URL('/?newsletter=confirmed', req.url));

  } catch (error) {
    console.error('[Newsletter] Confirm error:', error);
    return NextResponse.redirect(new URL('/?newsletter=error', req.url));
  }
}
