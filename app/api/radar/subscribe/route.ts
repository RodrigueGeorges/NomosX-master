import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

const radarSubscribeSchema = z.object({
  email: z.string().email('Email invalide'),
  frequency: z.enum(['daily', 'weekly', 'monthly'], { message: 'Fréquence invalide (daily, weekly, monthly)' }),
});

/**
 * POST /api/radar/subscribe
 * 
 * S'abonner au Radar pour recevoir les signaux faibles par email
 * 
 * Body:
 * - email: string
 * - frequency: "daily" | "weekly" | "monthly"
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 subscribe attempts per 15 minutes per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    try {
      await assertRateLimit(`radar:subscribe:${ip}`, 5, 15 * 60_000);
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
    const validation = radarSubscribeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { email, frequency } = validation.data;

    // 1. Trouver ou créer le Topic "Radar"
    let radarTopic = await prisma.topic.findUnique({
      where: { name: "Radar" },
    });

    if (!radarTopic) {
      radarTopic = await prisma.topic.create({
        data: {
          name: "Radar",
          query: "noveltyScore >= 60",
          tags: ["signaux-faibles", "tendances-emergentes", "radar"],
          description: "Signaux faibles et tendances émergentes détectés automatiquement",
          isActive: true,
        },
      });
    }

    // 2. Créer ou mettre à jour l'abonnement
    const subscription = await prisma.alertSubscription.upsert({
      where: {
        topicId_email: {
          topicId: radarTopic.id,
          email,
        },
      },
      update: {
        frequency,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        topicId: radarTopic.id,
        email,
        frequency,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        email: subscription.email,
        frequency: subscription.frequency,
        isActive: subscription.isActive,
      },
      message: `Abonnement confirmé ! Vous recevrez les signaux faibles ${
        frequency === "daily" ? "chaque jour" : 
        frequency === "weekly" ? "chaque semaine" : 
        "chaque mois"
      }.`,
    });
  } catch (error: any) {
    console.error("Subscribe to Radar error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'abonnement" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/radar/subscribe?email=...
 * 
 * Vérifier si un email est abonné au Radar
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email requis" },
        { status: 400 }
      );
    }

    // Trouver le topic Radar
    const radarTopic = await prisma.topic.findUnique({
      where: { name: "Radar" },
    });

    if (!radarTopic) {
      return NextResponse.json({
        subscribed: false,
      });
    }

    // Vérifier si abonné
    const subscription = await prisma.alertSubscription.findUnique({
      where: {
        topicId_email: {
          topicId: radarTopic.id,
          email,
        },
      },
    });

    return NextResponse.json({
      subscribed: !!subscription && subscription.isActive,
      frequency: subscription?.frequency,
      createdAt: subscription?.createdAt,
    });
  } catch (error: any) {
    console.error("Check subscription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/radar/subscribe?email=...
 * 
 * Se désabonner du Radar
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email requis" },
        { status: 400 }
      );
    }

    // Trouver le topic Radar
    const radarTopic = await prisma.topic.findUnique({
      where: { name: "Radar" },
    });

    if (!radarTopic) {
      return NextResponse.json(
        { error: "Topic Radar introuvable" },
        { status: 404 }
      );
    }

    // Désactiver l'abonnement (soft delete)
    await prisma.alertSubscription.update({
      where: {
        topicId_email: {
          topicId: radarTopic.id,
          email,
        },
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Désabonnement réussi",
    });
  } catch (error: any) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
