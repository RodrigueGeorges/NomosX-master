/**
 * Analytics Service — Product Analytics & Tracking
 *
 * Tracks user behavior, conversion events, and business metrics.
 * Integrates with Posthog (or Plausible) for product analytics.
 *
 * Events tracked:
 * - signup: User registration
 * - trial_started: Trial activation
 * - trial_expired: Trial expiry
 * - upgrade: Subscription upgrade
 * - brief_commissioned: User commissions a brief
 * - strategic_report: User commissions strategic report
 * - studio_analysis: User runs studio analysis
 */

import { httpPost } from './http-client';


export interface AnalyticsEvent {
  event: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, any>;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  referrer?: string;
}

export interface PageView {
  path: string;
  userId?: string;
  sessionId: string;
  duration?: number;
  timestamp: Date;
  userAgent?: string;
  referrer?: string;
}


// Posthog integration (if enabled)
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

/**
 * Track an analytics event
 */
export async function trackEvent(event: string, properties?: Record<string, any>, userId?: string): Promise<void> {
  const eventData: AnalyticsEvent = {
    event,
    userId,
    properties,
    timestamp: new Date(),
  };

  // Send to Posthog if configured
  if (POSTHOG_API_KEY) {
    try {
      await httpPost(`${POSTHOG_HOST}/capture/`, {
        api_key: POSTHOG_API_KEY,
        event,
        properties: {
          ...properties,
          distinct_id: userId || 'anonymous',
          timestamp: eventData.timestamp.toISOString(),
        },
      }, {
        timeout: 10000,
        retries: 1,
        rateLimiterKey: 'posthog',
      });
    } catch (error: any) {
      console.error('[Analytics] Posthog error:', error.message?.slice(0, 200));
    }
  }
}

/**
 * Track page view
 */
export async function trackPageView(path: string, userId?: string, sessionId?: string): Promise<void> {
  await trackEvent('$pageview', {
    $current_url: path,
    sessionId,
  }, userId);
}

/**
 * Track user signup
 */
export async function trackSignup(userId: string, properties?: {
  source?: string;
  plan?: string;
  hasTrial?: boolean;
}): Promise<void> {
  await trackEvent('signup', {
    plan: properties?.plan || 'ANALYST',
    hasTrial: properties?.hasTrial ?? true,
    acquisitionSource: properties?.source || 'direct',
  }, userId);
}

/**
 * Track trial activation
 */
export async function trackTrialStarted(userId: string, trialEnd: Date): Promise<void> {
  await trackEvent('trial_started', {
    trialEnd: trialEnd.toISOString(),
    trialDuration: 30, // days
  }, userId);
}

/**
 * Track trial expiry
 */
export async function trackTrialExpired(userId: string, trialDuration: number): Promise<void> {
  await trackEvent('trial_expired', {
    trialDuration,
    trialEnd: new Date().toISOString(),
  }, userId);
}

/**
 * Track subscription upgrade
 */
export async function trackUpgrade(userId: string, fromPlan: string, toPlan: string, revenue?: number): Promise<void> {
  await trackEvent('upgrade', {
    fromPlan,
    toPlan,
    revenue,
    currency: 'EUR',
  }, userId);
}

/**
 * Track brief commission
 */
export async function trackBriefCommissioned(userId: string, properties?: {
  format?: 'brief' | 'strategic';
  questionLength?: number;
  estimatedTime?: number;
}): Promise<void> {
  await trackEvent('brief_commissioned', {
    format: properties?.format || 'brief',
    questionLength: properties?.questionLength,
    estimatedTime: properties?.estimatedTime,
  }, userId);
}

/**
 * Track studio analysis
 */
export async function trackStudioAnalysis(userId: string, properties?: {
  publicationType?: string;
  verticalId?: string;
}): Promise<void> {
  await trackEvent('studio_analysis', {
    publicationType: properties?.publicationType,
    verticalId: properties?.verticalId,
  }, userId);
}

