import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { z } from 'zod';
import { withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/auth/verify-email
 * 
 * Verify email with token and mark as verified
 */

// Email verification schema
const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  email: z.string().email('Invalid email format'),
});

export async function GET(req: NextRequest) {
  return withRateLimit(
    rateLimitConfigs.auth,
    async (req) => {
      try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');
        const email = searchParams.get('email');

        // Validate inputs
        const validation = VerifyEmailSchema.safeParse({ token, email });
        if (!validation.success) {
          return NextResponse.json({ 
            error: 'Invalid verification link',
            details: validation.error.errors
          }, { status: 400 });
        }

        const { token: validToken, email: validEmail } = validation.data;

        const user = await prisma.user.findFirst({
          where: {
            email: decodeURIComponent(validEmail),
            verificationToken: validToken,
          },
        });

        // Check expiry from preferences as fallback until migration is applied
        if (user && user.preferences) {
          const prefs = user.preferences as Record<string, any>;
          if (prefs.emailVerificationExpires) {
            const expiryDate = new Date(prefs.emailVerificationExpires);
            if (expiryDate <= new Date()) {
              // Token expired
              return NextResponse.json({ 
                error: 'Invalid or expired verification link',
                code: 'EXPIRED_TOKEN'
              }, { status: 400 });
            }
          }
        }

        if (!user) {
          return NextResponse.json({ 
            error: 'Invalid or expired verification link',
            code: 'INVALID_TOKEN'
          }, { status: 400 });
        }

        // Mark email as verified
        const currentPreferences = (user.preferences as Record<string, any>) || {};
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            verificationToken: null,
            // Clear verification expiry from preferences
            preferences: {
              ...currentPreferences,
              emailVerificationExpires: null,
            },
          },
        });

        // Create session for user if not already logged in
        await createSession({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });

        // Redirect to dashboard with success message
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?verified=true`;
        
        return NextResponse.redirect(redirectUrl);

      } catch (error: any) {
        console.error('[Verify Email] Error:', error);
        return NextResponse.json(
          { error: 'Failed to verify email' },
          { status: 500 }
        );
      }
    }
  )(req);
}
