import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookEvent } from '@/lib/stripe';

/**
 * POST /api/stripe/webhook
 * 
 * Stripe webhook handler for subscription lifecycle events.
 * Verifies signature, processes checkout/subscription/invoice events.
 * 
 * Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const result = await handleWebhookEvent(body, signature);

  if (!result.received) {
    return NextResponse.json(
      { error: result.error || 'Webhook processing failed' },
      { status: result.error?.includes('not configured') ? 503 : 400 }
    );
  }

  return NextResponse.json({ received: true, type: result.type });
}
