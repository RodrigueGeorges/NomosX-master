/**
 * Stripe Integration — NomosX StudioX Payments
 *
 * Pay-per-commission checkout and webhook handling for StudioX orders.
 * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 *
 * If STRIPE_SECRET_KEY is not set, all functions gracefully return errors
 * without crashing.
 */

import Stripe from 'stripe';
import { prisma } from './db';
import { enqueueStudioXPipeline } from './studiox/enqueue';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : null;

/** Resolve or create a Stripe customer; persists ID on Subscription.stripeCustomerId. */
async function ensureStripeCustomer(userId: string, email: string): Promise<string | null> {
  if (!stripe) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) return null;

  if (user.subscription?.stripeCustomerId) {
    return user.subscription.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await prisma.subscription.upsert({
    where: { userId },
    update: { stripeCustomerId: customer.id },
    create: { userId, plan: 'ANALYST', stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Handle Stripe webhook events for StudioX payment completion.
 */
export async function handleWebhookEvent(
  body: string,
  signature: string
): Promise<{ received: boolean; type?: string; error?: string }> {
  if (!stripe) {
    return { received: false, error: 'Stripe not configured' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { received: false, error: 'STRIPE_WEBHOOK_SECRET not set' };
  }

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.type === 'studiox_order') {
        const orderId = session.metadata?.orderId;
        if (orderId) {
          await prisma.studioXOrder.update({
            where: { id: orderId },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              stripeSessionId: session.id,
              stripePaymentIntent: (session.payment_intent as string) ?? null,
            },
          });
          console.log(`[STRIPE] StudioX order ${orderId} paid — enqueueing pipeline`);
          void enqueueStudioXPipeline(orderId).catch((err) => {
            console.error(`[STRIPE] Failed to enqueue StudioX order ${orderId}:`, err);
          });
        }
      }
    }

    return { received: true, type: event.type };
  } catch (err: any) {
    console.error('[STRIPE] Webhook error:', err.message);
    return { received: false, error: 'Webhook signature verification failed' };
  }
}

/**
 * Create a Stripe Checkout Session for a StudioX pay-per-use order.
 */
export async function createStudioXCheckoutSession(params: {
  userId: string;
  orderId: string;
  formatLabel: string;
  amountCents: number;
  currency?: string;
}): Promise<{ url: string | null; sessionId?: string; error?: string }> {
  if (!stripe) {
    return { url: null, error: 'Stripe not configured (STRIPE_SECRET_KEY missing)' };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return { url: null, error: 'User not found' };

    const customerId = await ensureStripeCustomer(params.userId, user.email);
    if (!customerId) {
      return { url: null, error: 'Failed to resolve Stripe customer' };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: params.currency ?? 'eur',
          product_data: {
            name: `StudioX — ${params.formatLabel}`,
            description: 'NomosX commissioned research — 16-agent pipeline, adversarial review, [SRC-N] citations',
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'studiox_order',
        orderId: params.orderId,
        userId: params.userId,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio?orderId=${params.orderId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio?cancelled=true`,
    });

    return { url: session.url, sessionId: session.id };
  } catch (err: any) {
    console.error('[STRIPE] StudioX checkout error:', err.message);
    return { url: null, error: 'Failed to create checkout session' };
  }
}

/** Check if Stripe is configured and operational. */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}
