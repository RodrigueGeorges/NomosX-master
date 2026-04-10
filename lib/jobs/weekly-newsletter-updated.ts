/**
 * Updated Weekly Newsletter Job
 * Enhanced with new format system and LawZero-inspired templates
 */

import { prisma } from '@/lib/db';
import { sendBulkNewsletter } from '@/lib/email';
import { formatTitle, validateTitleFormat } from '@/lib/formatters/title-formatter';
import { countWords } from '@/lib/word-counter';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
const UTM = 'utm_source=email&utm_medium=newsletter&utm_campaign=weekly';

type UserTier = 'FREE' | 'ANALYST' | 'RESEARCHER';

interface Brief {
  id: string;
  title: string;
  summary: string;
  sourceCount: number;
  trustScore?: number;
  publicId?: string;
  formatId?: number;
  formatName?: string;
  wordCount?: number;
}

// ─── Enhanced Brief Card Renderers with LawZero Format ─────────────────────────────────

function renderBriefFree(brief: Brief, index: number, total: number): string {
  // Standardize title to LawZero format
  const standardizedTitle = formatTitle(brief.title, { format: 'lawzero' });
  
  // Extract 1-sentence hook from Key Findings section
  const hook = extractHookFromSummary(brief.summary);
  const briefUrl = `${APP_URL}/publications/${brief.publicId || brief.id}?${UTM}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? '1px solid #27272a' : 'none'};">
      <tr>
        <td>
          <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;margin:0 0 8px;">
            Brief ${index + 1} of ${total}
          </p>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${standardizedTitle}
          </h2>
          <p style="font-size:14px;color:#71717a;line-height:1.6;margin:0 0 12px;">
            ${hook}
          </p>
          <!-- Blurred teaser block -->
          <div style="position:relative;overflow:hidden;border-radius:6px;margin-bottom:16px;">
            <p style="font-size:13px;color:#52525b;line-height:1.6;margin:0;filter:blur(3px);user-select:none;pointer-events:none;padding:12px;background:#111113;border:1px solid #27272a;border-radius:6px;">
              ${extractTeaserContent(brief.summary)}…
            </p>
          </div>
          <a href="${briefUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;text-decoration:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:500;letter-spacing:0.01em;">
            Unlock full brief →
          </a>
        </td>
      </tr>
    </table>`;
}

function renderBriefAnalyst(brief: Brief, index: number, total: number): string {
  // Standardize title to LawZero format
  const standardizedTitle = formatTitle(brief.title, { format: 'lawzero' });
  
  // Extract ~150 words from Key Findings section
  const summary = extractSummaryForTier(brief.summary, 'ANALYST');
  const briefUrl = `${APP_URL}/publications/${brief.publicId || brief.id}?${UTM}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? '1px solid #27272a' : 'none'};">
      <tr>
        <td>
          <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;margin:0 0 8px;">
            Brief ${index + 1} of ${total}
          </p>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${standardizedTitle}
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
                <a href="${briefUrl}"
                   style="font-size:13px;color:#818cf8;text-decoration:none;font-weight:500;">
                  Read full brief →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderBriefResearcher(brief: Brief, index: number, total: number): string {
  // Standardize title to LawZero format
  const standardizedTitle = formatTitle(brief.title, { format: 'lawzero' });
  
  // Extract ~200 words from Key Findings section
  const summary = extractSummaryForTier(brief.summary, 'RESEARCHER');
  const briefUrl = `${APP_URL}/publications/${brief.publicId || brief.id}?${UTM}`;
  const trustColor = getTrustScoreColor(brief.trustScore || 0);

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? '1px solid #27272a' : 'none'};">
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
            <tr>
              <td>
                <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;margin:0;">
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
            ${standardizedTitle}
          </h2>
          <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 16px;">
            ${summary}
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:20px;">
                <span style="font-size:12px;color:#52525b;">${brief.sourceCount} peer-reviewed sources</span>
              </td>
              <td>
                <a href="${briefUrl}"
                   style="font-size:13px;color:#818cf8;text-decoration:none;font-weight:500;">
                  Read full brief →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// ─── Enhanced Content Extraction Functions ─────────────────────────────────────

function extractHookFromSummary(summary: string): string {
  // Try to extract from Key Findings section first
  const keyFindingsMatch = summary.match(/key-findings[^>]*>([\s\S]*?)<\/section>/i);
  if (keyFindingsMatch) {
    const text = keyFindingsMatch[1].replace(/<[^>]+>/g, '').trim();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[0].trim() + '…';
    }
  }
  
  // Fallback to executive summary
  const execSummaryMatch = summary.match(/executive-summary[^>]*>([\s\S]*?)<\/section>/i);
  if (execSummaryMatch) {
    const text = execSummaryMatch[1].replace(/<[^>]+>/g, '').trim();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[0].trim() + '…';
    }
  }
  
  // Final fallback
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences[0]?.trim().substring(0, 120) + '…' || summary.substring(0, 120) + '…';
}

function extractTeaserContent(summary: string): string {
  // Extract content for blurred teaser (from Key Findings)
  const keyFindingsMatch = summary.match(/key-findings[^>]*>([\s\S]*?)<\/section>/i);
  if (keyFindingsMatch) {
    const text = keyFindingsMatch[1].replace(/<[^>]+>/g, '').trim();
    return text.substring(120, 280);
  }
  
  // Fallback
  return summary.substring(120, 280);
}

function extractSummaryForTier(summary: string, tier: UserTier): string {
  // Extract from Key Findings section
  const keyFindingsMatch = summary.match(/key-findings[^>]*>([\s\S]*?)<\/section>/i);
  if (keyFindingsMatch) {
    const text = keyFindingsMatch[1].replace(/<[^>]+>/g, '').trim();
    
    if (tier === 'ANALYST') {
      // ~150 words
      return text.length > 600 ? text.slice(0, 600).replace(/\s\S+$/, '') + '…' : text;
    } else if (tier === 'RESEARCHER') {
      // ~200 words
      return text.length > 800 ? text.slice(0, 800).replace(/\s\S+$/, '') + '…' : text;
    }
  }
  
  // Fallback to executive summary
  const execSummaryMatch = summary.match(/executive-summary[^>]*>([\s\S]*?)<\/section>/i);
  if (execSummaryMatch) {
    const text = execSummaryMatch[1].replace(/<[^>]+>/g, '').trim();
    return text.slice(0, tier === 'ANALYST' ? 600 : 800);
  }
  
  return "Read the full analysis for key insights and recommendations.";
}

function getTrustScoreColor(score: number): string {
  if (score >= 85) return '#10b981'; // green
  if (score >= 70) return '#f59e0b'; // amber
  return '#6366f1'; // blue
}

// ─── Enhanced HTML Generator ─────────────────────────────────────────────────────

function generateNewsletterHTML(
  edition: { number: number; date: string },
  briefs: Brief[],
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
        <!-- Upgrade CTA (FREE only) -->
        <tr><td style="padding-top:8px;"></td></tr>
        <tr><td style="background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(124,58,237,0.08));border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:28px 32px;text-align:center;">
          <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;margin:0 0 10px;">
            Unlock full access
          </p>
          <h3 style="font-size:18px;font-weight:300;color:#fff;margin:0 0 8px;line-height:1.3;">
            You're seeing 1 sentence of each brief.
          </h3>
          <p style="font-size:13px;color:#71717a;margin:0 0 20px;line-height:1.6;">
            Analyst members receive the full summary + direct link to every brief.<br/>
            Researcher members get trust scores, source counts, and commission rights.
          </p>
          <a href="${APP_URL}/pricing?${UTM}&tier=analyst"
             style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;margin-bottom:12px;">
            Upgrade to Analyst →
          </a>
          <p style="font-size:12px;color:#52525b;margin:0;">
            From $29/month · Cancel anytime
          </p>
        </td></tr>` : tier === 'ANALYST' ? `
        <!-- Commission CTA (ANALYST) -->
        <tr><td style="padding-top:8px;"></td></tr>
        <tr><td style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:24px 32px;text-align:center;">
          <p style="font-size:13px;color:#a1a1aa;margin:0 0 14px;line-height:1.6;">
            Want a 15-page strategic report on any of these topics?<br/>
            <strong style="color:#e4e4e7;">Researcher</strong> members commission briefs on demand.
          </p>
          <a href="${APP_URL}/pricing?${UTM}&tier=researcher"
             style="font-size:13px;color:#818cf8;text-decoration:none;font-weight:500;">
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
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#e4e4e7;-webkit-font-smoothing:antialiased;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;">${preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Logo + Header -->
        <tr><td style="padding-bottom:28px;text-align:center;">
          <p style="font-size:24px;font-weight:300;letter-spacing:-0.02em;color:#fff;margin:0 0 4px;">
            Nomos<span style="color:#818cf8;font-weight:600;">X</span>
          </p>
          <p style="font-size:10px;font-weight:700;letter-spacing:0.22em;color:#6366f1;text-transform:uppercase;margin:0;">
            Intelligence Dispatch
          </p>
        </td></tr>

        <!-- Edition meta -->
        <tr><td style="padding-bottom:20px;text-align:center;">
          <p style="font-size:12px;color:#3f3f46;margin:0;">
            Edition #${edition.number} &nbsp;·&nbsp; ${edition.date} &nbsp;·&nbsp; <span style="color:#52525b;">${tierLabel}</span>
          </p>
        </td></tr>

        <!-- Intro -->
        <tr><td style="background:#111113;border:1px solid #27272a;border-radius:10px;padding:20px 24px;margin-bottom:20px;">
          <p style="font-size:14px;color:#a1a1aa;line-height:1.65;margin:0;">
            This week, the NomosX Think Tank published
            <strong style="color:#e4e4e7;">${briefs.length} peer-reviewed brief${briefs.length > 1 ? 's' : ''}</strong>
            — sourced from 250M+ academic publications, validated by 9 PhD-calibrated research agents.
          </p>
        </td></tr>

        <tr><td style="padding:16px 0;"></td></tr>

        <!-- Briefs card -->
        <tr><td style="background:#111113;border:1px solid #27272a;border-radius:12px;padding:28px 32px;">
          ${briefsHTML}
        </td></tr>

        ${upgradeCTA}

        <!-- Footer -->
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="font-size:12px;color:#3f3f46;margin:0 0 6px;">
            NomosX · The Autonomous Think Tank
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

// ─── Enhanced Brief Processing Functions ───────────────────────────────────────

// Get briefs published in the last week with format information
async function getWeeklyBriefs(): Promise<Brief[]> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const publications = await prisma.thinkTankPublication.findMany({
    where: {
      status: "PUBLISHED",
      type: { in: ["RESEARCH_BRIEF", "EXECUTIVE_BRIEF"] },
      publishedAt: { gte: oneWeekAgo },
    },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      html: true,
      publicId: true,
      sourceIds: true,
      trustScore: true,
      wordCount: true
    },
  });

  return publications.map(pub => ({
    id: pub.id,
    title: pub.title,
    summary: pub.html,
    sourceCount: pub.sourceIds.length,
    trustScore: pub.trustScore ?? undefined,
    publicId: pub.publicId || undefined,
    wordCount: pub.wordCount || countWords(pub.html)
  }));
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

  // Enrich with user tier where possible
  const enriched = await Promise.all(
    subscribers.map(async (sub) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: sub.email },
          select: { subscription: { select: { plan: true } } },
        });
        const tier = resolveSubscriberTier(user?.subscription?.plan);
        return { ...sub, tier };
      } catch {
        return { ...sub, tier: 'FREE' as UserTier };
      }
    })
  );

  return enriched;
}

// ─── Enhanced Main Job Function ─────────────────────────────────────────────

export async function runWeeklyNewsletter() {
  console.log("[Newsletter] Starting weekly newsletter job with enhanced format system...");

  try {
    // 1. Get briefs from the last week
    const briefs = await getWeeklyBriefs();

    if (briefs.length === 0) {
      console.log("[Newsletter] No briefs published this week. Skipping newsletter.");
      return { success: true, skipped: true, reason: "No briefs published" };
    }

    console.log(`[Newsletter] Found ${briefs.length} briefs to include`);
    
    // Log format information
    const formatBreakdown = briefs.reduce((acc, brief) => {
      const formatName = brief.formatName || 'Unknown';
      acc[formatName] = (acc[formatName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`[Newsletter] Format breakdown:`, formatBreakdown);

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
        subject: `NomosX Weekly #${editionNumber}: ${briefs.length} Executive Brief${briefs.length > 1 ? 's' : ''}`,
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
      formatBreakdown,
      avgWordCount: Math.round(briefs.reduce((sum, b) => sum + (b.wordCount || 0), 0) / briefs.length)
    };

  } catch (error) {
    console.error("[Newsletter] Error running weekly newsletter:", error);
    throw error;
  }
}

// Get next edition number
async function getNextEditionNumber(): Promise<number> {
  const lastEdition = await prisma.newsletterEdition.findFirst({
    orderBy: { editionNumber: "desc" },
    select: { editionNumber: true },
  });
  return (lastEdition?.editionNumber || 0) + 1;
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

