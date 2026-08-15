/**
 * Weekly Newsletter Job
 *
 * Tier-based intelligence dispatch — Abstrakt-style teasing:
 * - FREE:       Title + 1-sentence hook + blurred teaser + upgrade CTA
 * - ANALYST:    Title + full summary (150 words) + "Read full brief →" link
 * - RESEARCHER: Title + full summary + trust score + source count + direct link
 *
 * Schedule: Every Monday at 8:00 AM UTC
 * Run with: npx tsx lib/jobs/weekly-newsletter.ts
 */

import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { sendBulkNewsletter } from '@/lib/email';
import { inquiryUrl } from '@/lib/public-urls';
import { EMAIL_BRAND as E, emailTrustColor } from '@/lib/brand/email-brand';
import { emailLogoHeaderHtml } from '@/lib/brand/logo-inline';
import { BRAND_EMAIL_FOOTER, BRAND_EMAIL_TAGLINE } from '@/lib/brand/public-copy';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
const UTM = 'utm_source=email&utm_medium=newsletter&utm_campaign=weekly';

type UserTier = 'FREE' | 'ANALYST' | 'RESEARCHER';

// ─── Brief card renderers by tier ────────────────────────────────────────────

function renderBriefFree(brief: { id: string; title: string; summary: string; publicId?: string }, index: number, total: number): string {
  const hook = brief.summary.slice(0, 120).replace(/\s\S+$/, '') + '…';
  const briefUrl = `${inquiryUrl(brief.publicId || brief.id, true)}?${UTM}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? `1px solid ${E.borderSolid}` : 'none'};">
      <tr>
        <td>
          <p style="${E.eyebrow}margin:0 0 8px;">
            Brief ${index + 1} of ${total}
          </p>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${brief.title}
          </h2>
          <p style="font-size:14px;color:#71717a;line-height:1.6;margin:0 0 12px;">
            ${hook}
          </p>
          <div style="position:relative;overflow:hidden;margin-bottom:16px;">
            <p style="font-size:13px;color:${E.dim};line-height:1.6;margin:0;filter:blur(3px);user-select:none;pointer-events:none;padding:12px;background:${E.surface};border:1px solid ${E.borderSolid};">
              ${brief.summary.slice(120, 280)}…
            </p>
          </div>
          <a href="${briefUrl}" style="${E.ctaSm}">
            Unlock full brief →
          </a>
        </td>
      </tr>
    </table>`;
}

function renderBriefAnalyst(brief: { id: string; title: string; summary: string; sourceCount: number; publicId?: string }, index: number, total: number): string {
  const summary = brief.summary.length > 600 ? brief.summary.slice(0, 600).replace(/\s\S+$/, '') + '…' : brief.summary;
  const briefUrl = `${inquiryUrl(brief.publicId || brief.id, true)}?${UTM}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? `1px solid ${E.borderSolid}` : 'none'};">
      <tr>
        <td>
          <p style="${E.eyebrow}margin:0 0 8px;">
            Brief ${index + 1} of ${total}
          </p>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${brief.title}
          </h2>
          <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 16px;">
            ${summary}
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:20px;">
                <span style="font-size:12px;color:#52525b;">${brief.sourceCount} sources</span>
              </td>
              <td>
                <a href="${briefUrl}" style="${E.linkPlain}">
                  Read full brief →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderBriefResearcher(brief: { id: string; title: string; summary: string; sourceCount: number; trustScore?: number; publicId?: string }, index: number, total: number): string {
  const briefUrl = `${inquiryUrl(brief.publicId || brief.id, true)}?${UTM}`;
  const trustColor = emailTrustColor(brief.trustScore || 0);

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? `1px solid ${E.borderSolid}` : 'none'};">
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
            <tr>
              <td>
                <p style="${E.eyebrow}margin:0;">
                  Brief ${index + 1} of ${total}
                </p>
              </td>
              ${brief.trustScore ? `<td align="right">
                <span style="font-size:11px;font-weight:600;color:${trustColor};background:${trustColor}18;border:1px solid ${trustColor}40;padding:3px 10px;border-radius:20px;">
                  Trust ${brief.trustScore}/100
                </span>
              </td>` : ''}
            </tr>
          </table>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${brief.title}
          </h2>
          <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 16px;">
            ${brief.summary}
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:20px;">
                <span style="font-size:12px;color:#52525b;">${brief.sourceCount} peer-reviewed sources</span>
              </td>
              <td>
                <a href="${briefUrl}" style="${E.linkPlain}">
                  Read full brief →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// ─── Main HTML generator ──────────────────────────────────────────────────────

function generateNewsletterHTML(
  edition: { number: number; date: string },
  briefs: Array<{
    id: string;
    title: string;
    summary: string;
    sourceCount: number;
    trustScore?: number;
    publicId?: string;
  }>,
  tier: UserTier = 'FREE',
  subscriberEmail: string = '{{email}}'
): string {
  const briefsHTML = briefs.map((brief, i) => {
    if (tier === 'FREE') return renderBriefFree(brief, i, briefs.length);
    if (tier === 'RESEARCHER') return renderBriefResearcher(brief, i, briefs.length);
    return renderBriefAnalyst(brief, i, briefs.length);
  }).join('');

  const tierLabel = tier === 'FREE' ? 'Free' : tier === 'ANALYST' ? 'Analyst' : 'Researcher';
  const preheader = briefs[0]
    ? `${briefs[0].title} — plus ${briefs.length - 1} more brief${briefs.length > 2 ? 's' : ''} this week`
    : `NomosX Weekly #${edition.number} — your intelligence dispatch`;

  const upgradeCTA = tier === 'FREE' ? `
        <tr><td style="padding-top:8px;"></td></tr>
        <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);padding:28px 32px;text-align:center;">
          <p style="${E.eyebrow}margin:0 0 10px;">
            Unlock full access
          </p>
          <h3 style="font-size:18px;font-weight:300;color:#fff;margin:0 0 8px;line-height:1.3;">
            You're seeing 1 sentence of each brief.
          </h3>
          <p style="font-size:13px;color:#71717a;margin:0 0 20px;line-height:1.6;">
            Analyst members receive the full summary + direct link to every brief.<br/>
            Researcher members get trust scores, source counts, and commission rights.
          </p>
          <a href="${APP_URL}/pricing?${UTM}&tier=analyst" style="${E.cta}margin-bottom:12px;">
            Upgrade to Analyst →
          </a>
          <p style="font-size:12px;color:${E.dim};margin:0;">
            From $29/month · Cancel anytime
          </p>
        </td></tr>` : tier === 'ANALYST' ? `
        <tr><td style="padding-top:8px;"></td></tr>
        <tr><td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);padding:24px 32px;text-align:center;">
          <p style="font-size:13px;color:${E.muted};margin:0 0 14px;line-height:1.6;">
            Want a 15-page strategic report on any of these topics?<br/>
            <strong style="color:${E.text};">Researcher</strong> members commission briefs on demand.
          </p>
          <a href="${APP_URL}/pricing?${UTM}&tier=researcher" style="${E.linkPlain}">
            See Researcher plan →
          </a>
        </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>NomosX Weekly #${edition.number}</title>
</head>
<body style="margin:0;padding:0;background:${E.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${E.text};-webkit-font-smoothing:antialiased;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;">${preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.bg};padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <tr><td style="padding-bottom:28px;text-align:center;color:#ffffff;">
          ${emailLogoHeaderHtml(20)}
          <p style="${E.eyebrow}margin:8px 0 0;">
            Intelligence Dispatch
          </p>
        </td></tr>

        <tr><td style="padding-bottom:20px;text-align:center;">
          <p style="font-size:12px;color:${E.dim};margin:0;">
            Edition #${edition.number} &nbsp;·&nbsp; ${edition.date} &nbsp;·&nbsp; <span style="color:${E.muted};">${tierLabel}</span>
          </p>
        </td></tr>

        <tr><td style="background:${E.surface};border:1px solid ${E.borderSolid};padding:20px 24px;margin-bottom:20px;">
          <p style="font-size:14px;color:${E.muted};line-height:1.65;margin:0;">
            This week, the NomosX Think Tank published
            <strong style="color:${E.text};">${briefs.length} peer-reviewed brief${briefs.length > 1 ? 's' : ''}</strong>
            — sourced from 250M+ academic publications, validated through the agentic arbitration pipeline.
          </p>
        </td></tr>

        <tr><td style="padding:16px 0;"></td></tr>

        <tr><td style="background:${E.surface};border:1px solid ${E.borderSolid};padding:28px 32px;">
          ${briefsHTML}
        </td></tr>

        ${upgradeCTA}

        <!-- Footer -->
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="font-size:12px;color:#3f3f46;margin:0 0 6px;">
            ${BRAND_EMAIL_FOOTER}
          </p>
          <p style="font-size:12px;color:#3f3f46;margin:0;">
            <a href="${APP_URL}/api/newsletter/unsubscribe?email=${subscriberEmail}&${UTM}" style="color:#52525b;text-decoration:none;">Unsubscribe</a>
            &nbsp;·&nbsp;
            <a href="${APP_URL}/settings/notifications?${UTM}" style="color:#52525b;text-decoration:none;">Preferences</a>
            &nbsp;·&nbsp;
            <a href="${APP_URL}/privacy" style="color:#52525b;text-decoration:none;">Privacy</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Get briefs published in the last week
async function getWeeklyBriefs() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const publications = await prisma.thinkTankPublication.findMany({
    where: publicPublicationWhere({
      type: { in: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT", "RESEARCH_BRIEF", "EXECUTIVE_BRIEF", "POLICY_NOTE"] },
      publishedAt: { gte: oneWeekAgo },
    }),
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      html: true,
      publicId: true,
      sourceIds: true,
      trustScore: true,
    },
  });

  return publications.map(pub => ({
    id: pub.id,
    title: pub.title,
    summary: extractSummary(pub.html),
    sourceCount: pub.sourceIds.length,
    trustScore: pub.trustScore ?? undefined,
    publicId: pub.publicId || undefined,
  }));
}

// Extract summary from HTML content — tries executive-summary section, then key-findings, then first paragraph
function extractSummary(html: string): string {
  const sectionIds = ['executive-summary', 'key-findings', 'findings'];
  for (const id of sectionIds) {
    const match = html.match(new RegExp(`<section[^>]*id="?${id}"?[^>]*>([\\s\\S]*?)<\\/section>`, 'i'));
    if (match) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 50) return text.slice(0, 800) + (text.length > 800 ? '…' : '');
    }
  }

  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
    return text.slice(0, 800) + (text.length > 800 ? '…' : '');
  }

  return "Read the full analysis for key insights and recommendations.";
}

// Get next edition number
async function getNextEditionNumber(): Promise<number> {
  const lastEdition = await prisma.newsletterEdition.findFirst({
    orderBy: { editionNumber: "desc" },
    select: { editionNumber: true },
  });
  return (lastEdition?.editionNumber || 0) + 1;
}

// Resolve subscriber tier from their linked user account
function resolveSubscriberTier(planName?: string | null): UserTier {
  if (!planName) return 'FREE';
  const p = planName.toUpperCase();
  if (p.includes('RESEARCHER') || p.includes('STRATEGY') || p.includes('PRO')) return 'RESEARCHER';
  if (p.includes('ANALYST') || p.includes('EXECUTIVE')) return 'ANALYST';
  return 'FREE';
}

// Get active subscribers with their tier info
async function getActiveSubscribers() {
  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { status: "active" },
    select: {
      id: true,
      email: true,
    },
  });

  // Batch query: fetch all users with subscriptions in 2 queries instead of N+1
  const emails = subscribers.map(s => s.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, subscription: { select: { plan: true } } },
  });
  const userMap = new Map(users.map(u => [u.email, u.subscription?.plan ?? null]));

  const enriched = subscribers.map(sub => ({
    ...sub,
    tier: resolveSubscriberTier(userMap.get(sub.email)) as UserTier,
  }));

  return enriched;
}

// Main job function
export async function runWeeklyNewsletter() {
  console.log("[Newsletter] Starting weekly newsletter job...");

  try {
    // 1. Get briefs from the last week
    const briefs = await getWeeklyBriefs();

    if (briefs.length === 0) {
      console.log("[Newsletter] No briefs published this week. Skipping newsletter.");
      return { success: true, skipped: true, reason: "No briefs published" };
    }

    console.log(`[Newsletter] Found ${briefs.length} briefs to include`);

    // 2. Get next edition number
    const editionNumber = await getNextEditionNumber();
    const editionDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 3. Generate a reference HTML (FREE tier) for the edition record
    const html = generateNewsletterHTML(
      { number: editionNumber, date: editionDate },
      briefs,
      'FREE'
    );

    // 4. Create newsletter edition record
    const edition = await prisma.newsletterEdition.create({
      data: {
        editionNumber,
        subject: `NomosX Weekly #${editionNumber}: ${briefs.length} Open Publication${briefs.length > 1 ? 's' : ''}`,
        preheader: briefs[0]?.title || "This week's decision-ready insights",
        html,
        briefIds: briefs.map(b => b.id),
        status: "draft",
      },
    });

    console.log(`[Newsletter] Created edition #${editionNumber}`);

    // 5. Get active subscribers
    const subscribers = await getActiveSubscribers();
    console.log(`[Newsletter] ${subscribers.length} active subscribers`);

    if (subscribers.length === 0) {
      console.log("[Newsletter] No active subscribers. Edition saved as draft.");
      return { 
        success: true, 
        editionId: edition.id, 
        editionNumber,
        briefCount: briefs.length,
        subscriberCount: 0,
        status: "draft"
      };
    }

    // 6. Send tier-personalized emails per subscriber
    console.log(`[Newsletter] Sending to ${subscribers.length} subscribers (tier-personalized)...`);

    // Group by tier to generate HTML once per tier
    const htmlByTier: Record<UserTier, string> = {
      FREE: generateNewsletterHTML({ number: editionNumber, date: editionDate }, briefs, 'FREE'),
      ANALYST: generateNewsletterHTML({ number: editionNumber, date: editionDate }, briefs, 'ANALYST'),
      RESEARCHER: generateNewsletterHTML({ number: editionNumber, date: editionDate }, briefs, 'RESEARCHER'),
    };

    const sendResult = await sendBulkNewsletter(
      subscribers.map(s => ({ id: s.id, email: s.email, html: htmlByTier[s.tier] })),
      edition.subject,
      html,
      { batchSize: 50, delayMs: 200 }
    );

    console.log(`[Newsletter] Sent: ${sendResult.sent}, Failed: ${sendResult.failed}`);
    if (sendResult.errors.length > 0) {
      console.warn(`[Newsletter] Errors:`, sendResult.errors.slice(0, 5));
    }

    // Mark edition as sent
    await prisma.newsletterEdition.update({
      where: { id: edition.id },
      data: { 
        status: sendResult.failed === 0 ? "sent" : "partial",
        sentAt: new Date(),
        recipientCount: subscribers.length,
      },
    });

    return {
      success: true,
      editionId: edition.id,
      editionNumber,
      briefCount: briefs.length,
      subscriberCount: subscribers.length,
      sent: sendResult.sent,
      failed: sendResult.failed,
      status: sendResult.failed === 0 ? "sent" : "partial",
    };

  } catch (error) {
    console.error("[Newsletter] Error running weekly newsletter:", error);
    throw error;
  }
}

// CLI runner
if (require.main === module) {
  runWeeklyNewsletter()
    .then(result => {
      console.log("[Newsletter] Job completed:", result);
      process.exit(0);
    })
    .catch(error => {
      console.error("[Newsletter] Job failed:", error);
      process.exit(1);
    });
}
