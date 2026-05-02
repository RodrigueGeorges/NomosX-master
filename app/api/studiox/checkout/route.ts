import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createStudioXCheckoutSession } from '@/lib/stripe';
import { getStudioXPrice } from '@/lib/studiox-pricing';
import { getPublicationFormat } from '@/lib/publication-formats';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { question, formatType, mode, audience, urgency } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 });
  }

  const format = getPublicationFormat(formatType);
  const price = getStudioXPrice(formatType);

  // Create the order before the Stripe session so we have an ID for the success URL
  const order = await prisma.studioXOrder.create({
    data: {
      userId: session.id,
      question: question.trim(),
      formatType: formatType ?? 'RESEARCH_BRIEF',
      mode: mode ?? 'COMMISSION',
      audience: audience ?? null,
      urgency: urgency ?? null,
      amountCents: price.amountCents,
      currency: 'eur',
      status: 'PENDING',
    },
  });

  const checkout = await createStudioXCheckoutSession({
    userId: session.id,
    orderId: order.id,
    formatLabel: format.label,
    amountCents: price.amountCents,
    currency: 'eur',
  });

  if (!checkout.url) {
    // Clean up order if session creation failed
    await prisma.studioXOrder.delete({ where: { id: order.id } });
    return NextResponse.json({ error: checkout.error ?? 'Checkout failed' }, { status: 500 });
  }

  // Store Stripe session ID on the order
  await prisma.studioXOrder.update({
    where: { id: order.id },
    data: { stripeSessionId: checkout.sessionId },
  });

  return NextResponse.json({ checkoutUrl: checkout.url, orderId: order.id });
}
