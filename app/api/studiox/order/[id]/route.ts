import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { enqueueStudioXPipeline } from '@/lib/studiox/enqueue';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : null;

function serializeOrder(order: {
  id: string;
  question: string;
  formatType: string;
  mode: string;
  audience: string | null;
  urgency: string | null;
  amountCents: number;
  currency: string;
  status: string;
  result: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
  pipelineRunId: string | null;
  progressStep: string | null;
  progressPct: number | null;
  progressMessage: string | null;
  failureReason: string | null;
  startedAt: Date | null;
  failedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: order.id,
    question: order.question,
    formatType: order.formatType,
    mode: order.mode,
    audience: order.audience,
    urgency: order.urgency,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    result: order.result,
    paidAt: order.paidAt,
    completedAt: order.completedAt,
    pipelineRunId: order.pipelineRunId,
    progress: {
      step: order.progressStep,
      pct: order.progressPct,
      message: order.progressMessage,
    },
    failureReason: order.failureReason,
    startedAt: order.startedAt,
    failedAt: order.failedAt,
    refundedAt: order.refundedAt,
    createdAt: order.createdAt,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let order = await prisma.studioXOrder.findFirst({
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
        order = await prisma.studioXOrder.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            stripePaymentIntent: stripeSession.payment_intent as string ?? null,
          },
        });
        void enqueueStudioXPipeline(order.id).catch((err) => {
          console.error('[StudioX Order] Enqueue after Stripe verify failed:', err);
        });
      }
    } catch {
      // Stripe check failed — return order as-is
    }
  }

  // Reconcile: PAID but pipeline never queued (webhook/enqueue failure)
  if (order.status === 'PAID' && !order.result) {
    void enqueueStudioXPipeline(order.id).catch((err) => {
      console.error('[StudioX Order] Reconcile enqueue failed:', err);
    });
    order = await prisma.studioXOrder.findFirst({ where: { id, userId: session.id } }) ?? order;
  }

  return NextResponse.json({ order: serializeOrder(order) });
}
