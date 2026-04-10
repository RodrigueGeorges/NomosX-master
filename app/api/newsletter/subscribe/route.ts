/**
 * Newsletter Subscribe API
 * POST /api/newsletter/subscribe
 * 
 * Handles newsletter signup from homepage.
 * Simple email-only signup, no password required.
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { sendNewsletterConfirmation } from '@/lib/email';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 subscribe attempts per 15 minutes per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    try {
      await assertRateLimit(`newsletter:subscribe:${ip}`, 5, 15 * 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again later." },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const body = await req.json();
    const { email, source = "homepage", referrer } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if already subscribed
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // If already active, just return success (don't reveal subscription status)
      if (existing.status === "active") {
        return NextResponse.json({
          success: true,
          message: "You're all set! Check your inbox for our next edition.",
          alreadySubscribed: true,
        });
      }

      // If unsubscribed, reactivate
      if (existing.status === "unsubscribed") {
        const confirmToken = randomBytes(32).toString("hex");
        
        await prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            status: "pending",
            confirmToken,
            unsubscribedAt: null,
            unsubscribeReason: null,
            source,
            referrer,
          },
        });

        sendNewsletterConfirmation(normalizedEmail, confirmToken).catch(err =>
          console.error('[Newsletter] Confirmation email failed:', err)
        );

        return NextResponse.json({
          success: true,
          message: "Welcome back! Please check your email to confirm.",
          requiresConfirmation: true,
        });
      }

      // If pending, resend confirmation
      if (existing.status === "pending") {
        sendNewsletterConfirmation(normalizedEmail, existing.confirmToken!).catch(err =>
          console.error('[Newsletter] Resend confirmation failed:', err)
        );
        return NextResponse.json({
          success: true,
          message: "Please check your email to confirm your subscription.",
          requiresConfirmation: true,
        });
      }
    }

    // Create new subscriber
    const confirmToken = randomBytes(32).toString("hex");

    await prisma.newsletterSubscriber.create({
      data: {
        email: normalizedEmail,
        status: "pending",
        source,
        referrer,
        confirmToken,
      },
    });

    sendNewsletterConfirmation(normalizedEmail, confirmToken).catch(err =>
      console.error('[Newsletter] Confirmation email failed:', err)
    );

    console.log(`[Newsletter] New subscriber (pending) source: ${source}`);

    return NextResponse.json({
      success: true,
      message: "Almost there! Check your inbox to confirm your subscription.",
      requiresConfirmation: true,
    });

  } catch (error) {
    console.error("[Newsletter] Subscribe error:", error);
    
    // Handle unique constraint violation gracefully
    if ((error as any)?.code === "P2002") {
      return NextResponse.json({
        success: true,
        message: "You're all set! Check your inbox for our next edition.",
        alreadySubscribed: true,
      });
    }

    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// GET - Removed: was exposing subscription status without auth (P0-7)
// Use admin endpoints to check subscriber status
