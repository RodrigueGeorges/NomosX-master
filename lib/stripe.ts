/**
 * Stripe Integration — NomosX Subscription Management
 * 
 * Handles checkout sessions, webhook events, and subscription lifecycle.
 * Requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and price IDs in env.
 * 
 * If STRIPE_SECRET_KEY is not set, all functions gracefully return errors
 * without crashing — the app works in free-tier-only mode.
 */

import Stripe from 'stripe';
import { prisma } from './db';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : null;

export const STRIPE_PLANS = {
  TRIAL: {
    name: 'Free',
    priceId: null,
    features: ['Weekly summaries', 'Radar signals', 'Public brief previews'],
  },
  ANALYST: {
    name: 'Analyst',
    priceId: null,
    features: ['All published briefs', 'Signal radar', 'Weekly dispatch', 'Weak-signal alerts'],
  },
  RESEARCHER: {
    name: 'Researcher',
    priceId: process.env.STRIPE_PRICE_RESEARCHER || null,
    features: ['Everything in Analyst', 'Commission briefs', 'Strategic reports', 'Harvard Council', 'Custom verticals', 'Export citations'],
  },
  STUDIO: {
    name: 'Studio',
    priceId: process.env.STRIPE_PRICE_STUDIO || null,
    features: ['Everything in Researcher', 'Full editorial control', 'Publish under your brand', 'Priority pipeline', 'Dedicated support'],
  },
} as const;

export type StripePlan = keyof typeof STRIPE_PLANS;

/**
 * Create a Stripe Checkout Session for subscription upgrade.
 * Redirects user to Stripe-hosted payment page.
 */
export async function createCheckoutSession(
  userId: string,
  plan: StripePlan
): Promise<{ url: string | null; error?: string }> {
  if (!stripe) {
    return { url: null, error: 'Stripe not configured (STRIPE_SECRET_KEY missing)' };
  }

  const planConfig = STRIPE_PLANS[plan];
  if (!planConfig.priceId) {
    return { url: null, error: `No Stripe price ID configured for plan: ${plan}` };
  }

  try {
    // Find user + subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) return { url: null, error: 'User not found' };

    let customerId = user.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
      // Upsert subscription with Stripe customer ID
      await prisma.subscription.upsert({
        where: { userId },
        update: { stripeCustomerId: customerId },
        create: { userId, plan: 'ANALYST', stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      metadata: { userId, plan },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      allow_promotion_codes: true,
    });

    return { url: session.url };
  } catch (err: any) {
    console.error('[STRIPE] Checkout session error:', err.message);
    return { url: null, error: 'Failed to create checkout session' };
  }
}

/**
 * Create a Stripe Customer Portal session for managing subscription.
 */
export async function createPortalSession(
  userId: string
): Promise<{ url: string | null; error?: string }> {
  if (!stripe) {
    return { url: null, error: 'Stripe not configured' };
  }

  try {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    const customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      return { url: null, error: 'No Stripe customer found for this user' };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });

    return { url: session.url };
  } catch (err: any) {
    console.error('[STRIPE] Portal session error:', err.message);
    return { url: null, error: 'Failed to create portal session' };
  }
}

/**
 * Handle Stripe webhook events for subscription lifecycle.
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

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan as StripePlan | undefined;
        if (userId && plan) {
          await prisma.subscription.upsert({
            where: { userId },
            update: {
              plan: plan,
              status: 'active',
              isTrialActive: false,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              weeklyPublicationMax: -1,
              canExportPdf: true,
              canAccessStudio: plan === 'STUDIO',
              canCreateVerticals: plan === 'STUDIO',
              studioQuestionsPerMonth: plan === 'STUDIO' ? -1 : 0,
            },
            create: {
              userId,
              plan: plan,
              status: 'active',
              isTrialActive: false,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              weeklyPublicationMax: -1,
              canExportPdf: true,
              canAccessStudio: plan === 'STUDIO',
              canCreateVerticals: plan === 'STUDIO',
              studioQuestionsPerMonth: plan === 'STUDIO' ? -1 : 0,
            },
          });
          console.log(`[STRIPE] User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const subscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (subscription) {
          const isActive = ['active', 'trialing'].includes(sub.status);
          if (!isActive) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { plan: 'ANALYST', status: sub.status },
            });
            console.log(`[STRIPE] Subscription ${sub.id} status ${sub.status} → downgraded to ANALYST`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const subscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              plan: 'ANALYST',
              status: 'canceled',
              stripeSubscriptionId: null,
              canceledAt: new Date(),
            },
          });
          console.log(`[STRIPE] Subscription ${sub.id} cancelled → ANALYST`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscription = await prisma.subscription.findFirst({
          where: { stripeCustomerId: customerId },
          include: { user: true },
        });
        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'past_due' },
          });
          console.warn(`[STRIPE] Payment failed for user ${subscription.userId} (${subscription.user.email})`);
        }
        break;
      }
    }

    return { received: true, type: event.type };
  } catch (err: any) {
    console.error('[STRIPE] Webhook error:', err.message);
    return { received: false, error: 'Webhook signature verification failed' };
  }
}

/**
 * Check if Stripe is configured and operational.
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}
