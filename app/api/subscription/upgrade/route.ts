import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { trackUpgrade } from '@/lib/analytics';
import { z } from 'zod';
import { withValidationAndAuth, rateLimitConfigs, SubscriptionSchema } from '@/lib/validation';
import { createCheckoutSession, isStripeConfigured, type StripePlan } from '@/lib/stripe';

/**
 * POST /api/subscription/upgrade
 * 
 * Handle subscription upgrades between tiers.
 * - If Stripe is configured: creates a Checkout Session and returns the URL
 * - If Stripe is not configured: directly upgrades in DB (dev/testing mode)
 */

const UpgradeSchema = z.object({
  targetPlan: z.enum(['RESEARCHER', 'STUDIO', 'EXECUTIVE', 'STRATEGY'], {
    errorMap: () => ({ message: 'Invalid plan selected' })
  }),
});

export async function POST(req: NextRequest) {
  return withValidationAndAuth(
    UpgradeSchema,
    rateLimitConfigs.auth,
    async (data, req, userId) => {
      try {
        const session = await getSession();
        if (!session?.email) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
          where: { email: session.email },
          include: { subscription: true },
        });

        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { targetPlan } = data;

        // Normalize legacy plan names
        const normalizedPlan = targetPlan === 'EXECUTIVE' ? 'RESEARCHER' : 
                              targetPlan === 'STRATEGY' ? 'STUDIO' : targetPlan;

        // ─── Stripe Path: redirect to checkout ─────────────────────
        if (isStripeConfigured() && (normalizedPlan === 'RESEARCHER' || normalizedPlan === 'STUDIO')) {
          const { url, error } = await createCheckoutSession(user.id, normalizedPlan as StripePlan);
          if (url) {
            return NextResponse.json({ success: true, checkoutUrl: url });
          }
          // If Stripe price not configured, fall through to manual upgrade
          if (error && !error.includes('No Stripe price ID')) {
            return NextResponse.json({ error }, { status: 502 });
          }
        }

        // ─── Manual Path: direct DB upgrade (dev/testing) ──────────
        let subscription = user.subscription;
        if (!subscription) {
          subscription = await prisma.subscription.create({
            data: {
              userId: user.id,
              plan: normalizedPlan,
              status: "active",
              weeklyPublicationMax: -1,
              studioQuestionsPerMonth: normalizedPlan === 'STUDIO' ? -1 : 0,
              canAccessStudio: normalizedPlan === 'STUDIO',
              canCreateVerticals: normalizedPlan === 'STUDIO',
              canExportPdf: true,
              isTrialActive: false,
            },
          });
        } else {
          const updates: any = {
            plan: normalizedPlan,
            status: "active",
            isTrialActive: false,
          };

          if (normalizedPlan === 'RESEARCHER') {
            updates.weeklyPublicationMax = -1;
            updates.studioQuestionsPerMonth = 0;
            updates.canAccessStudio = false;
            updates.canCreateVerticals = false;
            updates.canExportPdf = true;
          } else if (normalizedPlan === 'STUDIO') {
            updates.weeklyPublicationMax = -1;
            updates.studioQuestionsPerMonth = -1;
            updates.canAccessStudio = true;
            updates.canCreateVerticals = true;
            updates.canExportPdf = true;
          }

          subscription = await prisma.subscription.update({
            where: { userId: user.id },
            data: updates,
          });
        }

        // Track upgrade analytics (non-blocking)
        const fromPlan = user.subscription?.plan || 'NONE';
        const revenue = normalizedPlan === 'RESEARCHER' ? 19 : normalizedPlan === 'STUDIO' ? 49 : 0;
        
        trackUpgrade(user.id, fromPlan, normalizedPlan, revenue).catch(err =>
          console.error('[Subscription Upgrade] Analytics tracking failed:', err)
        );

        return NextResponse.json({
          success: true,
          message: `Upgraded to ${normalizedPlan} plan`,
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            weeklyPublicationMax: subscription.weeklyPublicationMax,
            studioQuestionsPerMonth: subscription.studioQuestionsPerMonth,
            canAccessStudio: subscription.canAccessStudio,
            canCreateVerticals: subscription.canCreateVerticals,
            canExportPdf: subscription.canExportPdf,
          }
        });

      } catch (error) {
        console.error('[API/Subscription/Upgrade] Error:', error);
        return NextResponse.json(
          { error: "Failed to upgrade subscription" },
          { status: 500 }
        );
      }
    }
  )(req);
}
