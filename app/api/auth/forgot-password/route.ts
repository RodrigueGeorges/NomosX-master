/**
 * POST /api/auth/forgot-password
 * Send a password reset email with a secure token.
 * Token expires in 1 hour.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 attempts per 15 minutes per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    try {
      await assertRateLimit(`forgot-password:${ip}`, 3, 15 * 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: 'Too many attempts. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    });

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal whether the email exists
      return successResponse;
    }

    // Generate secure reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token on user record
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: resetExpiry,
      },
    });

    // Send email (fire and forget — don't block response)
    sendPasswordResetEmail(normalizedEmail, resetToken).catch(err =>
      console.error('[Auth] Password reset email failed:', err)
    );

    console.log(`[Auth] Password reset requested for user: ${user.id}`);

    return successResponse;
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
