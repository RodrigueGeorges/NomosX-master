import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/auth/me
 * Get current authenticated user
 */

// No schema needed for GET request, but we add rate limiting and auth
export async function GET(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
        try {
          const user = await getSession();

          if (!user) {
            return NextResponse.json(
              { error: "Non authentifié" },
              { status: 401 }
            );
          }

          return NextResponse.json({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
          });
        } catch (error: any) {
          console.error("[Me API] Error:", error);
          return NextResponse.json(
            { error: "Erreur lors de la récupération de l'utilisateur" },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
