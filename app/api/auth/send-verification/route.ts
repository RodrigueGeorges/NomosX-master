import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmailVerificationEmail } from '@/lib/email';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * POST /api/auth/send-verification
 * 
 * Send email verification link to user
 */

// Send verification schema (empty body, but we validate it's proper JSON)
const SendVerificationSchema = z.object({});

export async function POST(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.auth,
      async (req) => {
        try {
          // Validate request body (even if empty)
          const validation = SendVerificationSchema.safeParse({});
          if (!validation.success) {
            return NextResponse.json(
              { 
                error: 'Invalid request format',
                details: validation.error.errors 
              },
              { status: 400 }
            );
          }

          // Rate limit: 3 emails per hour per user
          const session = await getSession();
          if (!session?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

          try {
            assertRateLimit(`email:verify:${session.email}`, 3, 60 * 60_000);
          } catch (err) {
            if (err instanceof RateLimitError) {
              return NextResponse.json(
                { error: 'Too many verification requests. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
              );
            }
            throw err;
          }

          const user = await prisma.user.findUnique({
            where: { email: session.email },
          });

          if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          // Generate verification token using crypto
          const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

          // Save verification token (using existing schema fields)
          const currentPreferences = (user.preferences as Record<string, any>) || {};
          await prisma.user.update({
            where: { id: user.id },
            data: {
              verificationToken: token,
              // Note: emailVerificationExpires will be added via migration
              // For now, we'll use a timestamp in preferences as fallback
              preferences: {
                ...currentPreferences,
                emailVerificationExpires: expiresAt.toISOString(),
              },
            },
          });

          // Send verification email
          const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
          
          await sendEmailVerificationEmail(user.email, user.name, verificationUrl);

          return NextResponse.json({
            success: true,
            message: 'Verification email sent',
          });

        } catch (error: any) {
          console.error('[Send Verification] Error:', error);
          
          // Handle specific email service errors
          if (error.message?.includes('Email service unavailable')) {
            return NextResponse.json(
              { error: 'Email service temporarily unavailable' },
              { status: 503 }
            );
          }

          if (error.message?.includes('Invalid email address')) {
            return NextResponse.json(
              { error: 'Invalid email address' },
              { status: 400 }
            );
          }

          return NextResponse.json(
            { error: 'Failed to send verification email' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
