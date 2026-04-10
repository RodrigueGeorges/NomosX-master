import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword,createSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { sendWelcomeEmail } from '@/lib/email';
import { trackSignup, trackTrialStarted } from '@/lib/analytics';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  name: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Create a new user account
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 registrations per hour per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    try {
      assertRateLimit(`auth:register:${ip}`, 3, 60 * 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Trop de tentatives. Réessayez plus tard." },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const body = await req.json();
    
    // Validate input
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, name } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with trial subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name || null,
        role: "user",
        subscription: {
          create: {
            plan: "ANALYST",
            status: "active",
            trialEnd: trialEnd,
            isTrialActive: true,
            weeklyPublicationMax: 3,
            studioQuestionsPerMonth: 0,
            weeklyPublicationCount: 0,
            studioQuestionsUsed: 0,
            canAccessStudio: false,
            canCreateVerticals: false,
            canExportPdf: false,
          },
        },
      },
      include: { subscription: true },
    });

    // Create session
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcomeEmail(user.email, user.name).catch(err =>
      console.error('[Register] Welcome email failed:', err)
    );

    // Track analytics events (non-blocking)
    trackSignup(user.id, {
      plan: 'ANALYST',
      hasTrial: true,
      source: 'direct', // TODO: track from referral/UTM params
    }).catch(err => console.error('[Register] Analytics tracking failed:', err));

    if (user.subscription?.trialEnd) {
      trackTrialStarted(user.id, user.subscription.trialEnd).catch(err =>
        console.error('[Register] Trial tracking failed:', err)
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error("[Register API] Error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du compte" },
      { status: 500 }
    );
  }
}
