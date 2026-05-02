/**
 * NomosX Email Service — Resend
 * Central email utility for all transactional emails.
 * Requires: RESEND_API_KEY, EMAIL_FROM env vars.
 * 
 * Features:
 * - Premium dark mode design
 * - Optimized preheaders for email clients
 * - UTM tracking on all links
 * - Responsive layout
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'NomosX <noreply@nomosx.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

// UTM params for tracking
const UTM_CAMPAIGN = {
  welcome: 'utm_source=email&utm_medium=transactional&utm_campaign=welcome',
  newsletter: 'utm_source=email&utm_medium=transactional&utm_campaign=newsletter',
  brief_ready: 'utm_source=email&utm_medium=transactional&utm_campaign=brief_ready',
  publication: 'utm_source=email&utm_medium=transactional&utm_campaign=publication',
  digest: 'utm_source=email&utm_medium=transactional&utm_campaign=digest',
  trial_expiry: 'utm_source=email&utm_medium=transactional&utm_campaign=trial_expiry',
  trial_expired: 'utm_source=email&utm_medium=transactional&utm_campaign=trial_expired',
  email_verification: 'utm_source=email&utm_medium=transactional&utm_campaign=email_verification',
  password_reset: 'utm_source=email&utm_medium=transactional&utm_campaign=password_reset',
};

function addUtmParams(url: string, campaign: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${campaign}`;
}

interface SendEmailResult {
  success: boolean;
  error?: string;
}

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email to', to);
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[Email] Resend error:', res.status, body);
    return { success: false, error: `Resend error: ${res.status}` };
  }

  return { success: true };
}

// ─── Shared layout wrapper ──────────────────────────────────────────────────

function layout(content: string, preheader?: string): string {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>NomosX</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#e4e4e7;-webkit-font-smoothing:antialiased;">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <p style="font-size:24px;font-weight:300;letter-spacing:-0.02em;color:#fff;margin:0 0 2px;">
                Nomos<span style="color:#818cf8;font-weight:600;">X</span>
              </p>
              <p style="font-size:10px;font-weight:700;letter-spacing:0.2em;color:#6366f1;text-transform:uppercase;margin:0;">
                The Autonomous Think Tank
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background:#111113;border:1px solid #27272a;border-radius:12px;padding:36px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="font-size:12px;color:#3f3f46;margin:0;">
                NomosX · The Autonomous Think Tank<br/>
                <a href="${APP_URL}/api/newsletter/unsubscribe" style="color:#52525b;text-decoration:none;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="${APP_URL}/privacy" style="color:#52525b;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email templates ────────────────────────────────────────────────────────

/**
 * Welcome email sent after account creation.
 */
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<void> {
  const displayName = name || 'Researcher';
  const dashboardUrl = addUtmParams(`${APP_URL}/dashboard`, UTM_CAMPAIGN.welcome);
  const pricingUrl = addUtmParams(`${APP_URL}/pricing`, UTM_CAMPAIGN.welcome);
  const html = layout(`
    <h1 style="font-size:24px;font-weight:300;color:#fff;margin:0 0 8px;">
      Welcome to NomosX, ${displayName}.
    </h1>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.6;">
      Your account is active. NomosX is an autonomous think tank — 9 PhD-calibrated AI researchers
      publish peer-reviewed intelligence briefs continuously, across economics, policy, technology,
      climate, law, and more.
    </p>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 32px;line-height:1.6;">
      As an <strong style="color:#e4e4e7;">Analyst</strong>, you have access to all published briefs
      and the weekly intelligence dispatch. Ready to commission your own research?
      <a href="${pricingUrl}" style="color:#818cf8;text-decoration:none;">Upgrade to Researcher →</a>
    </p>
    <a href="${dashboardUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;
              text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
      Go to your dashboard →
    </a>
    <hr style="border:none;border-top:1px solid #27272a;margin:32px 0;" />
    <p style="font-size:12px;color:#52525b;margin:0;">
      Questions? Reply to this email — we read everything.
    </p>
  `, `Your NomosX account is ready, ${displayName} — start exploring 250M+ academic sources`);

  await sendEmail({ to, subject: 'Welcome to NomosX — your think tank is ready', html });
}

/**
 * Newsletter subscription confirmation (double opt-in).
 */
export async function sendNewsletterConfirmation(to: string, confirmToken: string): Promise<void> {
  const confirmUrl = `${APP_URL}/api/newsletter/confirm?token=${confirmToken}`;
  const html = layout(`
    <h1 style="font-size:24px;font-weight:300;color:#fff;margin:0 0 8px;">
      Confirm your subscription.
    </h1>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.6;">
      You requested to receive the NomosX weekly intelligence dispatch — briefs auto-published
      by our PhD research agents across 12 domains.
    </p>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 32px;line-height:1.6;">
      Click below to confirm your email address and activate your subscription.
    </p>
    <a href="${confirmUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;
              text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
      Confirm subscription →
    </a>
    <p style="font-size:12px;color:#52525b;margin:32px 0 0;">
      If you didn't request this, you can safely ignore this email.
      This link expires in 48 hours.
    </p>
  `, 'One click to activate — weekly intelligence briefs from 250M+ academic sources');

  await sendEmail({ to, subject: 'Confirm your NomosX subscription', html });
}

/**
 * Welcome email for confirmed newsletter subscribers.
 */
export async function sendNewsletterWelcome(to: string): Promise<void> {
  const publicationsUrl = addUtmParams(`${APP_URL}/publications`, UTM_CAMPAIGN.newsletter);
  const unsubUrl = `${APP_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(to)}`;
  const html = layout(`
    <h1 style="font-size:24px;font-weight:300;color:#fff;margin:0 0 8px;">
      You're subscribed.
    </h1>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.6;">
      Every week, NomosX publishes peer-reviewed intelligence briefs — written autonomously
      by 9 PhD-calibrated AI researchers, sourced from 250M+ academic publications.
    </p>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 32px;line-height:1.6;">
      Your first dispatch arrives next Monday. In the meantime, browse our published briefs.
    </p>
    <a href="${publicationsUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;
              text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
      Browse publications →
    </a>
    <hr style="border:none;border-top:1px solid #27272a;margin:32px 0;" />
    <p style="font-size:12px;color:#52525b;margin:0;">
      To unsubscribe at any time:
      <a href="${unsubUrl}" style="color:#6366f1;text-decoration:none;">click here</a>.
    </p>
  `, 'Your first intelligence dispatch arrives Monday — browse this week\'s briefs now');

  await sendEmail({ to, subject: 'Welcome to the NomosX intelligence dispatch', html });
}

/**
 * Bulk newsletter send — used by the weekly newsletter cron job.
 * Supports per-subscriber HTML override for tier-personalized content.
 * Sends in batches with configurable delay to respect Resend rate limits.
 */
export async function sendBulkNewsletter(
  subscribers: Array<{ id: string; email: string; html?: string }>,
  subject: string,
  fallbackHtml: string,
  options: { batchSize?: number; delayMs?: number } = {}
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const { batchSize = 50, delayMs = 200 } = options;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (sub) => {
        const result = await sendEmail({ to: sub.email, subject, html: sub.html ?? fallbackHtml });
        if (result.success) {
          sent++;
        } else {
          failed++;
          errors.push(`${sub.email}: ${result.error || 'Unknown error'}`);
        }
      })
    );

    if (i + batchSize < subscribers.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { sent, failed, errors };
}

/**
 * New brief published notification (for subscribers who opted in).
 */
export async function sendBriefPublishedNotification(
  to: string,
  brief: { title: string; summary: string; id: string; trustScore?: number }
): Promise<void> {
  const briefUrl = addUtmParams(`${APP_URL}/publications/${brief.id}`, UTM_CAMPAIGN.publication);
  const trust = brief.trustScore ? `${brief.trustScore}/100` : '';
  const html = layout(`
    <p style="font-size:10px;font-weight:700;letter-spacing:0.2em;color:#6366f1;text-transform:uppercase;margin:0 0 16px;">
      New Publication
    </p>
    <h1 style="font-size:22px;font-weight:300;color:#fff;margin:0 0 16px;line-height:1.3;">
      ${brief.title}
    </h1>
    ${trust ? `<p style="font-size:12px;color:#52525b;margin:0 0 16px;">Trust score: <strong style="color:#6366f1;">${trust}</strong></p>` : ''}
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 32px;line-height:1.6;">
      ${brief.summary}
    </p>
    <a href="${briefUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;
              text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;">
      Read the full brief →
    </a>
    <hr style="border:none;border-top:1px solid #27272a;margin:32px 0;" />
    <p style="font-size:12px;color:#52525b;margin:0;">
      You're receiving this because you subscribed to NomosX publications.
      <a href="${APP_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(to)}"
         style="color:#52525b;text-decoration:none;">Unsubscribe</a>.
    </p>
  `, `${brief.title} — peer-reviewed intelligence from NomosX`);

  await sendEmail({ to, subject: `New brief: ${brief.title}`, html });
}

/**
 * Trial expiry reminder emails
 */
export async function sendTrialExpiryReminder(to: string, name: string | null, daysRemaining: number): Promise<void> {
  const displayName = name || 'Researcher';
  const urgency = daysRemaining <= 1 ? 'critical' : daysRemaining <= 3 ? 'high' : 'medium';
  
  const upgradeUrl = addUtmParams(`${APP_URL}/pricing`, UTM_CAMPAIGN.trial_expiry);
  const dashboardUrl = addUtmParams(`${APP_URL}/dashboard`, UTM_CAMPAIGN.trial_expiry);
  
  const urgencyColors = {
    critical: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
    high: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    medium: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
  };
  
  const colors = urgencyColors[urgency];
  
  const html = layout(`
    <div style="background: ${urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#f59e0b' : '#6366f1'}10; border: 1px solid ${urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#f59e0b' : '#6366f1'}30; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="font-size: 14px; font-weight: 600; color: ${urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#f59e0b' : '#6366f1'}; margin: 0;">
        ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining in your trial
      </p>
    </div>
    
    <h1 style="font-size: 24px; font-weight: 300; color: #fff; margin: 0 0 8px;">
      Your NomosX trial expires soon
    </h1>
    
    <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.6;">
      Hi ${displayName}, your 30-day free trial of NomosX will expire in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.
      Continue commissioning StudioX research mandates by upgrading to a paid plan. Public publications remain open.
    </p>
    
    <div style="background: #111113; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 500; color: #fff; margin: 0 0 12px;">
        What happens if you don't upgrade?
      </h3>
      <ul style="font-size: 14px; color: #a1a1aa; margin: 0; padding-left: 20px; line-height: 1.6;">
        <li style="margin-bottom: 8px;">You'll lose access to commission new StudioX mandates</li>
        <li style="margin-bottom: 8px;">Public publications remain readable</li>
        <li style="margin-bottom: 8px;">Weekly publication limit drops to 0</li>
        <li>You'll still receive the weekly intelligence dispatch</li>
      </ul>
    </div>
    
    <div style="display: flex; gap: 12px; align-items: center;">
      <a href="${upgradeUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #6366f1, #7c3aed); color: #fff;
                text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
        Upgrade Now →
      </a>
      <a href="${dashboardUrl}"
         style="display: inline-block; color: #818cf8; text-decoration: none; font-size: 14px;">
        View Dashboard
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;" />
    
    <p style="font-size: 12px; color: #52525b; margin: 0;">
      Questions? Reply to this email — we read everything.
    </p>
  `, `Your NomosX trial expires in ${daysRemaining} days — upgrade to keep commissioning briefs`);

  await sendEmail({ 
    to, 
    subject: `Trial expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} - Upgrade to continue`, 
    html 
  });
}

export async function sendEmailVerificationEmail(to: string, name: string | null, verificationUrl: string): Promise<void> {
  const displayName = name || 'Researcher';
  const dashboardUrl = addUtmParams(`${APP_URL}/dashboard`, UTM_CAMPAIGN.email_verification);
  
  const html = layout(`
    <h1 style="font-size: 24px; font-weight: 300; color: #fff; margin: 0 0 8px;">
      Verify your email address
    </h1>
    
    <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.6;">
      Hi ${displayName}, please verify your email address to complete your NomosX registration.
      This ensures you receive important notifications about your research briefs and account.
    </p>
    
    <div style="background: #111113; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 500; color: #fff; margin: 0 0 12px;">
        Why verify your email?
      </h3>
      <ul style="font-size: 14px; color: #a1a1aa; margin: 0; padding-left: 20px; line-height: 1.6;">
        <li style="margin-bottom: 8px;">Receive weekly intelligence dispatch</li>
        <li style="margin-bottom: 8px;">Get notifications when your briefs are ready</li>
        <li style="margin-bottom: 8px;">Reset your password if needed</li>
        <li>Important account security updates</li>
      </ul>
    </div>
    
    <a href="${verificationUrl}"
       style="display: inline-block; background: linear-gradient(135deg, #6366f1, #7c3aed); color: #fff;
              text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500; margin-bottom: 16px;">
      Verify Email Address →
    </a>
    
    <p style="font-size: 12px; color: #52525b; margin: 0; line-height: 1.6;">
      This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
      <br />
      Having trouble? <a href="${dashboardUrl}" style="color: #6366f1; text-decoration: none;">Go to your dashboard</a>
    </p>
  `, `Verify your email address to activate your NomosX account`);

  await sendEmail({ 
    to, 
    subject: 'Verify your email address - NomosX', 
    html 
  });
}

export async function sendTrialExpired(to: string, name: string | null): Promise<void> {
  const displayName = name || 'Researcher';
  const upgradeUrl = addUtmParams(`${APP_URL}/pricing`, UTM_CAMPAIGN.trial_expired);
  const publicationsUrl = addUtmParams(`${APP_URL}/publications`, UTM_CAMPAIGN.trial_expired);
  
  const html = layout(`
    <h1 style="font-size: 24px; font-weight: 300; color: #fff; margin: 0 0 8px;">
      Your NomosX trial has expired
    </h1>
    
    <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.6;">
      Hi ${displayName}, your 30-day free trial of NomosX has expired. 
      Your access to commission StudioX research mandates has been paused.
    </p>
    
    <div style="background: #111113; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 500; color: #fff; margin: 0 0 12px;">
        What you can still do:
      </h3>
      <ul style="font-size: 14px; color: #a1a1aa; margin: 0; padding-left: 20px; line-height: 1.6;">
        <li style="margin-bottom: 8px;">Browse all open publications</li>
        <li style="margin-bottom: 8px;">Receive the weekly intelligence dispatch</li>
        <li>Read signals, memos, briefs, reports, and dossiers</li>
      </ul>
    </div>
    
    <div style="display: flex; gap: 12px; align-items: center;">
      <a href="${upgradeUrl}"
         style="display: inline-block; background: linear-gradient(135deg, #6366f1, #7c3aed); color: #fff;
                text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
        Reactivate Access →
      </a>
      <a href="${publicationsUrl}"
         style="display: inline-block; color: #818cf8; text-decoration: none; font-size: 14px;">
        Browse Publications
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;" />
    
    <p style="font-size: 12px; color: #52525b; margin: 0;">
      Want to reactivate your trial? Reply to this email and we'll help you out.
    </p>
  `, `Your NomosX trial has expired — upgrade to continue commissioning research`);

  await sendEmail({ 
    to, 
    subject: 'Your trial has expired - Upgrade to continue', 
    html 
  });
}

/**
 * Commissioned publication ready notification — sent when a StudioX output is complete.
 */
export async function sendBriefReadyNotification(
  to: string,
  brief: {
    title: string;
    id: string;
    type: 'brief' | 'strategic_report';
    trustScore?: number;
    sourceCount?: number;
    question?: string;
  },
  name?: string | null
): Promise<void> {
  const briefUrl = addUtmParams(`${APP_URL}/publications/${brief.id}`, UTM_CAMPAIGN.brief_ready);
  const displayName = name || 'Researcher';
  const isStrategic = brief.type === 'strategic_report';
  const typeLabel = isStrategic ? 'Strategic Report' : 'Research Brief';
  const trustColor = (brief.trustScore || 0) >= 85 ? '#10b981' : (brief.trustScore || 0) >= 70 ? '#f59e0b' : '#6366f1';
  const preheader = `Your ${isStrategic ? 'strategic report' : 'brief'} is ready: ${brief.title}`;

  const html = layout(`
    <p style="font-size:10px;font-weight:700;letter-spacing:0.2em;color:#6366f1;text-transform:uppercase;margin:0 0 16px;">
      ${isStrategic ? '⚡ Strategic Report Ready' : '✓ Brief Ready'}
    </p>
    <h1 style="font-size:22px;font-weight:300;color:#fff;margin:0 0 6px;line-height:1.3;">
      ${brief.title}
    </h1>
    ${brief.question ? `<p style="font-size:13px;color:#52525b;margin:0 0 20px;font-style:italic;">"${brief.question}"</p>` : '<div style="margin-bottom:20px;"></div>'}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#111113;border:1px solid #27272a;border-radius:8px;padding:16px 20px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:24px;">
                <p style="font-size:11px;color:#52525b;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.1em;">Type</p>
                <p style="font-size:13px;color:#e4e4e7;margin:0;font-weight:500;">${typeLabel}</p>
              </td>
              ${brief.trustScore ? `<td style="padding-right:24px;">
                <p style="font-size:11px;color:#52525b;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.1em;">Trust Score</p>
                <p style="font-size:13px;font-weight:600;color:${trustColor};margin:0;">${brief.trustScore}/100</p>
              </td>` : ''}
              ${brief.sourceCount ? `<td>
                <p style="font-size:11px;color:#52525b;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.1em;">Sources</p>
                <p style="font-size:13px;color:#e4e4e7;margin:0;font-weight:500;">${brief.sourceCount} cited</p>
              </td>` : ''}
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:#a1a1aa;line-height:1.65;margin:0 0 28px;">
      ${displayName}, your commissioned ${isStrategic ? 'strategic report' : 'brief'} has been completed by the NomosX research agents.
      ${isStrategic ? 'The full 15-page analysis — including scenario planning, stakeholder matrix, and implementation roadmap — is now available.' : 'The full analysis with citations and evidence assessment is ready to read.'}
    </p>

    <a href="${briefUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;
              text-decoration:none;padding:13px 30px;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:0.01em;">
      ${isStrategic ? 'Read your strategic report →' : 'Read your brief →'}
    </a>

    <hr style="border:none;border-top:1px solid #27272a;margin:32px 0;" />
    <p style="font-size:12px;color:#52525b;margin:0;line-height:1.6;">
      Want to commission another brief?
      <a href="${addUtmParams(`${APP_URL}/dashboard`, UTM_CAMPAIGN.brief_ready)}" style="color:#6366f1;text-decoration:none;">Go to your dashboard →</a>
    </p>
  `, preheader);

  const subject = isStrategic
    ? `Your strategic report is ready: ${brief.title}`
    : `Your brief is ready: ${brief.title}`;

  await sendEmail({ to, subject, html });
}

/**
 * Password reset email.
 */
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = addUtmParams(`${APP_URL}/reset-password?token=${resetToken}`, UTM_CAMPAIGN.password_reset);
  const html = layout(`
    <h1 style="font-size:24px;font-weight:300;color:#fff;margin:0 0 8px;">
      Reset your password
    </h1>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
      We received a request to reset the password for your NomosX account. Click below to choose a new password.
    </p>
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(to right,#6366f1,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">
        Reset Password
      </a>
    </p>
    <p style="font-size:12px;color:#52525b;line-height:1.5;margin:0;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
  `, 'Reset your NomosX password — this link expires in 1 hour');

  await sendEmail({ to, subject: 'Reset your password — NomosX', html });
}

// ─── Exports for API routes ───────────────────────────────────────────────

export { sendEmail };

/** Alias for sendEmail — used by digest routes */
export async function sendDigestEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  return sendEmail({ to, subject, html });
}

/** Alias for sendEmail — used by contact route */
export async function sendContactEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  return sendEmail({ to, subject, html });
}
