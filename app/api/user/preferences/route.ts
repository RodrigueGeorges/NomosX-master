import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const preferencesSchema = z.object({
  emailFrequency: z.enum(['daily', 'weekly', 'monthly', 'never']).optional(),
  emailEnabled: z.boolean().optional(),
  verticalPreferences: z.array(z.object({
    verticalId: z.string().min(1),
    enabled: z.boolean(),
  })).optional(),
});

/**
 * GET /api/user/preferences
 * Get user's vertical preferences and email settings
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user with preferences
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        emailFrequency: true,
        emailEnabled: true,
        lastEmailSentAt: true,
        verticalPreferences: {
          include: {
            vertical: {
              select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                icon: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      emailFrequency: userData.emailFrequency,
      emailEnabled: userData.emailEnabled,
      lastEmailSentAt: userData.lastEmailSentAt,
      verticalPreferences: userData.verticalPreferences.map((pref) => ({
        verticalId: pref.verticalId,
        enabled: pref.enabled,
        vertical: pref.vertical,
      })),
    });
  } catch (error: any) {
    console.error("[Preferences API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/preferences
 * Update user's vertical preferences and email settings
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = preferencesSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { emailFrequency, emailEnabled, verticalPreferences } = validation.data;

    // Update email settings
    if (emailFrequency !== undefined || emailEnabled !== undefined) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(emailFrequency !== undefined && { emailFrequency }),
          ...(emailEnabled !== undefined && { emailEnabled }),
        },
      });
    }

    // Update vertical preferences
    if (verticalPreferences && Array.isArray(verticalPreferences)) {
      // verticalPreferences format: [{ verticalId: string, enabled: boolean }]
      
      for (const pref of verticalPreferences) {
        await prisma.userVerticalPreference.upsert({
          where: {
            userId_verticalId: {
              userId: user.id,
              verticalId: pref.verticalId,
            },
          },
          create: {
            userId: user.id,
            verticalId: pref.verticalId,
            enabled: pref.enabled,
          },
          update: {
            enabled: pref.enabled,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Preferences updated successfully",
    });
  } catch (error: any) {
    console.error("[Preferences API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
