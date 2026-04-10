import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createPortalSession, isStripeConfigured } from '@/lib/stripe';

/**
 * POST /api/subscription/portal
 * 
 * Creates a Stripe Customer Portal session for managing subscription.
 * Allows users to update payment method, cancel, or change plan.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Billing portal not available — Stripe not configured' },
        { status: 503 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: session.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { url, error } = await createPortalSession(user.id);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[API/Subscription/Portal] Error:', err);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
