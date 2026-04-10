import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, hashPassword, createSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { z } from 'zod';
import { withValidation, withRateLimit, rateLimitConfigs, LoginSchema } from '@/lib/validation';

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
export async function POST(req: NextRequest) {
  return withRateLimit(
    rateLimitConfigs.auth,
    withValidation(LoginSchema, async (data, req) => {
        try {
          const { email, password } = data;

          // Find user
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
          });

          if (!user) {
            return NextResponse.json(
              { error: "Email ou mot de passe incorrect" },
              { status: 401 }
            );
          }

          // Verify password
          const isValidPassword = await verifyPassword(password, user.password);

          if (!isValidPassword) {
            return NextResponse.json(
              { error: "Email ou mot de passe incorrect" },
              { status: 401 }
            );
          }

          // Seamless migration: if password is legacy-hashed, upgrade to bcrypt on successful login
          if (!String(user.password || "").startsWith("$2")) {
            try {
              const upgraded = await hashPassword(password);
              await prisma.user.update({
                where: { id: user.id },
                data: { password: upgraded },
              });
            } catch (e) {
              console.warn("[Login API] Failed to upgrade password hash:", (e as any)?.message || e);
            }
          }

          // Create session (sets HttpOnly cookie)
          await createSession({
            id: user.id,
            email: user.email,
            name: user.name || '',
            role: user.role || 'user',
          });

          // Return user data (excluding password)
          const { password: _, ...userWithoutPassword } = user;

          return NextResponse.json({
            success: true,
            user: userWithoutPassword,
          });
        } catch (error: any) {
          console.error("[Login API] Error:", error);
          
          // Handle rate limit errors
          if (error instanceof RateLimitError) {
            return NextResponse.json(
              { error: "Trop de tentatives de connexion. Veuillez réessayer plus tard." },
              { status: 429 }
            );
          }

          return NextResponse.json(
            { error: "Erreur lors de la connexion" },
            { status: 500 }
          );
        }
    })
  )(req);
}
