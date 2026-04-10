import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/subscription/status
 * Returns current user subscription status, trial info, and limits
 */

// No schema needed for GET request, but we add auth and rate limiting
export async function GET(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
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

          // Create subscription if doesn't exist (trial by default)
          let subscription = user.subscription;
          if (!subscription) {
            const trialStart = new Date();
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 30);

            subscription = await prisma.subscription.create({
              data: {
                userId: user.id,
                plan: "ANALYST",
                trialStart,
                trialEnd,
                isTrialActive: true,
                status: "trialing",
                weeklyPublicationMax: 3,
                studioQuestionsPerMonth: 0,
                canAccessStudio: false,
                canCreateVerticals: false,
              },
            });
          }

          // Calculate trial days remaining
          const now = new Date();
          let trialDaysRemaining = 0;
          if (subscription.isTrialActive && subscription.trialEnd) {
            const diffTime = subscription.trialEnd.getTime() - now.getTime();
            trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          }

          // Check if trial expired
          const isTrialExpired = subscription.isTrialActive && trialDaysRemaining === 0;

          // Calculate weekly publication limit status
          const weeklyLimitReached = subscription.weeklyPublicationCount >= subscription.weeklyPublicationMax;

          // Calculate studio limit status
          const studioLimitReached = subscription.studioQuestionsUsed >= subscription.studioQuestionsPerMonth;

          return NextResponse.json({
            plan: subscription.plan,
            status: subscription.status,
            
            // Trial info
            isTrialActive: subscription.isTrialActive && !isTrialExpired,
            trialDaysRemaining,
            isTrialExpired,
            
            // Limits
            weeklyPublicationCount: subscription.weeklyPublicationCount,
            weeklyPublicationMax: subscription.weeklyPublicationMax,
            weeklyLimitReached,
            
            activeVerticals: subscription.activeVerticals,
            activeVerticalsMax: subscription.activeVerticalsMax,
            verticalsLimitReached: subscription.activeVerticals >= subscription.activeVerticalsMax,
            
            // Studio limits
            studioQuestionsPerMonth: subscription.studioQuestionsPerMonth,
            studioQuestionsUsed: subscription.studioQuestionsUsed,
            studioLimitReached,
            studioQuestionsRemaining: Math.max(0, subscription.studioQuestionsPerMonth - subscription.studioQuestionsUsed),
            
            // Features
            canExportPdf: subscription.canExportPdf,
            canAccessStudio: subscription.canAccessStudio,
            canCreateVerticals: subscription.canCreateVerticals,
            
            // Billing
            stripeCustomerId: subscription.stripeCustomerId,
            currentPeriodEnd: subscription.stripeCurrentPeriodEnd,
          });
        } catch (error: any) {
          console.error("Error fetching subscription status:", error);
          return NextResponse.json(
            { error: "Failed to fetch subscription status" },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
