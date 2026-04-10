import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Email verification middleware
 * Blocks access to protected routes if email is not verified
 */

export async function requireEmailVerification(request?: NextRequest): Promise<{ allowed: boolean; user?: any }> {
  try {
    const session = await getSession();
    if (!session?.email) {
      return { allowed: false };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.email },
      select: { id: true, email: true, emailVerified: true, name: true }
    });

    if (!user) {
      return { allowed: false };
    }

    // Allow access if email is verified
    if (user.emailVerified) {
      return { allowed: true, user };
    }

    // Block access if email not verified
    return { allowed: false, user };
  } catch (error) {
    console.error('[Email Verification] Error:', error);
    return { allowed: false };
  }
}

/**
 * Create email verification required response
 */
export function createEmailVerificationRequiredResponse(): NextResponse {
  return NextResponse.json({
    error: 'Email verification required',
    message: 'Please verify your email address to access this feature',
    verificationRequired: true,
    resendUrl: '/api/auth/send-verification'
  }, { status: 403 });
}

/**
 * Middleware wrapper for API routes
 */
export function withEmailVerification(handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse>) {
  return async (req: NextRequest, ...args: any[]) => {
    const verification = await requireEmailVerification(req);
    
    if (!verification.allowed) {
      return createEmailVerificationRequiredResponse();
    }

    // Add user to request for downstream use
    (req as any).user = verification.user;
    
    return handler(req, ...args);
  };
}
