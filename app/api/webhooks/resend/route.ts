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

/**
 * Svix signature verification (Resend webhooks are Svix-signed).
 * Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
 * Signature header: `svix-signature: v1,<base64-hmac> [v1,<base64-hmac>...]`
 * Secret: `whsec_...` — the base64 part after the prefix is the HMAC key.
 * Tolerance: 5 minutes on the timestamp (replay protection).
 */
function verifySvixSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(keyB64, 'base64'); } catch { return false; }

  const expected = createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest('base64');

  // Header may carry multiple "v1,<sig>" entries (key rotation) — any match wins.
  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
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
    const rawBody = await req.text();
    const svixId = req.headers.get('svix-id') || '';
    const svixTimestamp = req.headers.get('svix-timestamp') || '';
    const svixSignature = req.headers.get('svix-signature') || '';

    if (!verifySvixSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret)) {
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
