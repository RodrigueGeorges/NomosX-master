/**
 * Resend Webhook Handler
 * POST /api/webhooks/resend
 *
 * Events handled:
 * - email.bounced     → mark subscriber as bounced
 * - email.complained  → mark subscriber as unsubscribed (spam complaint)
 * - email.opened      → update lastOpenedAt
 * - email.clicked     → update lastClickedAt
 *
 * Setup in Resend dashboard:
 *   Webhooks → Add endpoint → https://yoursite.com/api/webhooks/resend
 *   Select events: email.bounced, email.complained, email.opened, email.clicked
 *   Set RESEND_WEBHOOK_SECRET in Netlify env vars.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(`sha256=${expected}`);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, webhook secret is mandatory
  if (!webhookSecret && isProduction) {
    console.error('[Webhook/Resend] RESEND_WEBHOOK_SECRET not set in production — rejecting');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  if (webhookSecret) {
    const signature = req.headers.get('svix-signature') || req.headers.get('x-resend-signature') || '';
    const rawBody = await req.text();

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.warn('[Webhook/Resend] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    try {
      const event = JSON.parse(rawBody);
      await handleEvent(event);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  } else {
    // Dev mode only — no secret configured, process without verification
    console.warn('[Webhook/Resend] Processing without signature verification (dev mode)');
    try {
      const event = await req.json();
      await handleEvent(event);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: { type: string; data: { to?: string[]; email_id?: string } }) {
  const email = event.data?.to?.[0];
  if (!email) return;

  const normalizedEmail = email.toLowerCase().trim();

  switch (event.type) {
    case 'email.bounced': {
      await prisma.newsletterSubscriber.updateMany({
        where: { email: normalizedEmail, status: { not: 'unsubscribed' } },
        data: { status: 'bounced' },
      }).catch(() => {});
      console.log(`[Webhook/Resend] Bounced: ${normalizedEmail}`);
      break;
    }

    case 'email.complained': {
      // Spam complaint — hard unsubscribe immediately
      await prisma.newsletterSubscriber.updateMany({
        where: { email: normalizedEmail },
        data: {
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          unsubscribeReason: 'spam_complaint',
        },
      }).catch(() => {});
      console.log(`[Webhook/Resend] Spam complaint: ${normalizedEmail}`);
      break;
    }

    case 'email.opened': {
      await prisma.newsletterSubscriber.updateMany({
        where: { email: normalizedEmail },
        data: { lastEmailSentAt: new Date() },
      }).catch(() => {});
      break;
    }

    case 'email.clicked': {
      // Track engagement — reuse lastEmailSentAt as proxy for last activity
      await prisma.newsletterSubscriber.updateMany({
        where: { email: normalizedEmail },
        data: { lastEmailSentAt: new Date() },
      }).catch(() => {});
      break;
    }

    default:
      // Ignore unknown events
      break;
  }
}
