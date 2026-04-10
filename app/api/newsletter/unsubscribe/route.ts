/**
 * Newsletter Unsubscribe API
 * POST /api/newsletter/unsubscribe
 * GET /api/newsletter/unsubscribe?token=xxx (one-click unsubscribe)
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, reason } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (!subscriber) {
      // Don't reveal if email exists or not
      return NextResponse.json({
        success: true,
        message: "You have been unsubscribed.",
      });
    }

    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: "unsubscribed",
        unsubscribedAt: new Date(),
        unsubscribeReason: reason || null,
      },
    });

    console.log(`[Newsletter] Unsubscribed: ${normalizedEmail}`);

    return NextResponse.json({
      success: true,
      message: "You have been unsubscribed. We're sorry to see you go.",
    });

  } catch (error) {
    console.error("[Newsletter] Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// One-click unsubscribe via GET (for email links)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  if (!token && !email) {
    return NextResponse.json(
      { error: "Token or email required" },
      { status: 400 }
    );
  }

  try {
    let subscriber;

    if (token) {
      subscriber = await prisma.newsletterSubscriber.findUnique({
        where: { confirmToken: token },
      });
    } else if (email) {
      subscriber = await prisma.newsletterSubscriber.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    }

    if (subscriber) {
      await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: {
          status: "unsubscribed",
          unsubscribedAt: new Date(),
          unsubscribeReason: "one-click",
        },
      });
    }

    // Redirect to confirmation page
    return NextResponse.redirect(new URL("/unsubscribed", req.url));

  } catch (error) {
    console.error("[Newsletter] Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
