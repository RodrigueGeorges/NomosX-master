import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import Sentry from '@sentry/nextjs';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : null;

function autoRefundEnabled(): boolean {
  return process.env.STUDIOX_AUTO_REFUND !== 'false';
}

/**
 * Refund a failed StudioX order via Stripe PaymentIntent.
 * Idempotent — skips if already refunded.
 */
export async function refundStudioXOrder(
  orderId: string
): Promise<{ refunded: boolean; reason?: string; refundId?: string }> {
  if (!autoRefundEnabled()) {
    return { refunded: false, reason: 'auto_refund_disabled' };
  }
  if (!stripe) {
    return { refunded: false, reason: 'stripe_not_configured' };
  }

  const order = await prisma.studioXOrder.findUnique({ where: { id: orderId } });
  if (!order) return { refunded: false, reason: 'order_not_found' };
  if (order.refundedAt || order.status === 'REFUNDED') {
    return { refunded: false, reason: 'already_refunded', refundId: order.stripeRefundId ?? undefined };
  }
  if (order.status !== 'FAILED') {
    return { refunded: false, reason: `invalid_status:${order.status}` };
  }

  const paymentIntentId = order.stripePaymentIntent;
  if (!paymentIntentId) {
    console.error(`[StudioX Refund] Order ${orderId} FAILED but no payment_intent`);
    return { refunded: false, reason: 'no_payment_intent' };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: { orderId, type: 'studiox_pipeline_failure' },
    });

    await prisma.studioXOrder.update({
      where: { id: orderId },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        stripeRefundId: refund.id,
        progressMessage: 'Payment refunded — the research pipeline could not complete.',
      },
    });

    console.log(`[StudioX Refund] Order ${orderId} refunded ${refund.id}`);
    return { refunded: true, refundId: refund.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[StudioX Refund] Order ${orderId} refund failed:`, message);
    Sentry.captureException(err, { extra: { orderId, paymentIntentId } });
    return { refunded: false, reason: message };
  }
}
