import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withValidation, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * POST /api/auth/logout
 * Destroy user session
 */

// Logout schema (empty body, but we validate it's proper JSON)
const LogoutSchema = z.object({});

export async function POST(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.auth,
      withValidation(LogoutSchema, async (data, req) => {
        try {
          // Check if user is authenticated before allowing logout
          const session = await deleteSession();

          return NextResponse.json({
            success: true,
            message: "Déconnexion réussie",
          });
        } catch (error: any) {
          console.error("[Logout API] Error:", error);
          return NextResponse.json(
            { error: "Erreur lors de la déconnexion" },
            { status: 500 }
          );
        }
      })
    )
  )(req);
}
