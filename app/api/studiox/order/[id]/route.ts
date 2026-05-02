import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : null;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.studioXOrder.findFirst({
    where: { id, userId: session.id },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Verify payment with Stripe if still PENDING (webhook may not have fired yet)
  if (order.status === 'PENDING' && order.stripeSessionId && stripe) {
    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      if (stripeSession.payment_status === 'paid') {
        const updated = await prisma.studioXOrder.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            stripePaymentIntent: stripeSession.payment_intent as string ?? null,
          },
        });
        return NextResponse.json({ order: updated });
      }
    } catch {
      // Stripe check failed — return order as-is
    }
  }

  return NextResponse.json({ order });
}
