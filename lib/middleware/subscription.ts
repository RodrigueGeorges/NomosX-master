import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Subscription middleware — tier-based access control
 *
 * Tiers (canonical):
 *   ANALYST   — free, read-only access to published briefs + weekly dispatch
 *   RESEARCHER — paid (€19/mo), commission briefs + strategic reports
 *   STUDIO    — paid (€49/mo), full editorial control + API + white-label
 *
 * Legacy aliases still accepted from DB: TRIAL→ANALYST, EXECUTIVE→RESEARCHER, STRATEGY→STUDIO
 */

export type Tier = 'ANALYST' | 'RESEARCHER' | 'STUDIO';

/** Normalize legacy plan names to canonical tiers */
export function normalizeTier(plan: string | null | undefined): Tier {
  if (!plan) return 'ANALYST';
  const p = plan.toUpperCase();
  if (p === 'STUDIO' || p === 'STRATEGY') return 'STUDIO';
  if (p === 'RESEARCHER' || p === 'EXECUTIVE') return 'RESEARCHER';
  return 'ANALYST'; // ANALYST, TRIAL, FREE, or unknown → free tier
}

export interface SubscriptionCheck {
  tier: Tier;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  canAccessBriefs: boolean;
  canAccessStudio: boolean;
  canCreateVerticals: boolean;
  canExportPdf: boolean;
  canCommissionBriefs: boolean;
  weeklyLimit: number;
  studioLimit: number;
  weeklyUsed: number;
  studioUsed: number;
  weeklyLimitReached: boolean;
  studioLimitReached: boolean;
}

/**
 * Check user subscription and return access info
 */
export async function checkSubscription(request?: NextRequest): Promise<SubscriptionCheck | null> {
  try {
    const session = await getSession();
    if (!session?.email) return null;

    const user = await prisma.user.findUnique({
      where: { email: session.email },
      include: { subscription: true },
    });

    if (!user) return null;

    const sub = user.subscription;
    const tier = normalizeTier(sub?.plan);

    // Trial expiry logic
    const trialEnd = sub?.trialEnd ?? null;
    const now = new Date();
    const trialExpired = trialEnd ? now > trialEnd : false;
    const trialDaysRemaining = trialEnd
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
      : 30;
    const isTrialActive = (sub?.isTrialActive ?? true) && !trialExpired;

    // A user on ANALYST tier with expired trial loses commission access
    const effectiveTier: Tier = (tier === 'ANALYST' && trialExpired) ? 'ANALYST' : tier;

    const isPaid = effectiveTier === 'RESEARCHER' || effectiveTier === 'STUDIO';
    const isStudio = effectiveTier === 'STUDIO';

    const weeklyUsed = sub?.weeklyPublicationCount ?? 0;
    const weeklyLimit = sub?.weeklyPublicationMax ?? 3;
    const studioUsed = sub?.studioQuestionsUsed ?? 0;
    const studioLimit = sub?.studioQuestionsPerMonth ?? 0;

    return {
      tier: effectiveTier,
      isTrialActive,
      trialDaysRemaining,
      trialExpired,
      canAccessBriefs: true, // All tiers can read published briefs
      canAccessStudio: isStudio || (sub?.canAccessStudio ?? false),
      canCreateVerticals: isStudio || (sub?.canCreateVerticals ?? false),
      canExportPdf: isPaid || (sub?.canExportPdf ?? false),
      canCommissionBriefs: isPaid || isTrialActive,
      weeklyLimit,
      studioLimit,
      weeklyUsed,
      studioUsed,
      weeklyLimitReached: weeklyLimit !== -1 && weeklyUsed >= weeklyLimit,
      studioLimitReached: studioLimit !== -1 && studioUsed >= studioLimit,
    };

  } catch (error) {
    console.error('[Subscription Check] Error:', error);
    return null;
  }
}

/** Require STUDIO tier */
export async function requireStudioTier(request?: NextRequest): Promise<{ allowed: boolean; subscription?: SubscriptionCheck }> {
  const subscription = await checkSubscription(request);
  if (!subscription) return { allowed: false };
  if (subscription.tier !== 'STUDIO') return { allowed: false, subscription };
  return { allowed: true, subscription };
}

/** @deprecated use requireStudioTier */
export const requireStrategyTier = requireStudioTier;

/** Require RESEARCHER+ tier (or active trial) */
export async function requireResearcherTier(request?: NextRequest): Promise<{ allowed: boolean; subscription?: SubscriptionCheck }> {
  const subscription = await checkSubscription(request);
  if (!subscription) return { allowed: false };
  if (!subscription.canCommissionBriefs) return { allowed: false, subscription };
  return { allowed: true, subscription };
}

/** @deprecated use requireResearcherTier */
export const requireExecutiveTier = requireResearcherTier;

/** Require any authenticated user */
export async function requireAuth(request?: NextRequest): Promise<{ allowed: boolean; subscription?: SubscriptionCheck }> {
  const subscription = await checkSubscription(request);
  if (!subscription) return { allowed: false };
  return { allowed: true, subscription };
}

export function hasExceededWeeklyLimit(subscription: SubscriptionCheck): boolean {
  return subscription.weeklyLimitReached;
}

export function hasExceededStudioLimit(subscription: SubscriptionCheck): boolean {
  return subscription.studioLimitReached;
}

export function createAccessDeniedResponse(requiredTier: Tier, currentTier?: Tier): NextResponse {
  const messages = {
    'ANALYST': 'Analyst tier or higher required',
    'RESEARCHER': 'Researcher tier or higher required',
    'STUDIO': 'Studio tier required',
  };

  return NextResponse.json({
    error: messages[requiredTier],
    requiredTier,
    currentTier,
    upgradeUrl: '/pricing'
  }, { status: 403 });
}

export function createLimitExceededResponse(limitType: 'weekly' | 'studio'): NextResponse {
  const messages = {
    weekly: 'Weekly brief commission limit exceeded',
    studio: 'Studio question limit exceeded',
  };

  return NextResponse.json({
    error: messages[limitType],
    limitType,
    upgradeUrl: '/pricing'
  }, { status: 429 });
}
