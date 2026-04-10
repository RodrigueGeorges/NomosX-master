import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const toggleVerticalSchema = z.object({
  verticalId: z.string().min(1),
  enabled: z.boolean(),
});

/**
 * GET /api/user/verticals
 * Get all available verticals with user's preference status
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all active verticals
    const verticals = await prisma.vertical.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        nameEn: true,
        description: true,
        icon: true,
        color: true,
      },
      orderBy: { name: "asc" },
    });

    // Get user's preferences
    const userPreferences = await prisma.userVerticalPreference.findMany({
      where: { userId: user.id },
      select: {
        verticalId: true,
        enabled: true,
      },
    });

    // Create a map for quick lookup
    const preferencesMap = new Map(
      userPreferences.map((p) => [p.verticalId, p.enabled])
    );

    // Merge verticals with user preferences
    const verticalsWithPreferences = verticals.map((vertical) => ({
      ...vertical,
      enabled: preferencesMap.get(vertical.id) ?? false, // Default to false if not set
    }));

    return NextResponse.json({
      verticals: verticalsWithPreferences,
    });
  } catch (error: any) {
    console.error("[Verticals API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch verticals" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/verticals
 * Toggle a specific vertical preference
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = toggleVerticalSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { verticalId, enabled } = validation.data;

    // Verify vertical exists
    const vertical = await prisma.vertical.findUnique({
      where: { id: verticalId },
    });

    if (!vertical) {
      return NextResponse.json(
        { error: "Vertical not found" },
        { status: 404 }
      );
    }

    // Upsert preference
    await prisma.userVerticalPreference.upsert({
      where: {
        userId_verticalId: {
          userId: user.id,
          verticalId: verticalId,
        },
      },
      create: {
        userId: user.id,
        verticalId: verticalId,
        enabled: enabled,
      },
      update: {
        enabled: enabled,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Vertical preference updated",
    });
  } catch (error: any) {
    console.error("[Verticals API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update vertical preference" },
      { status: 500 }
    );
  }
}
