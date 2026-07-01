/**
 * Weekly Brief Email Template
 *
 * Personalized intelligence delivery based on user's vertical preferences
 * Sent weekly with latest open publications from selected verticals
 */

import { emailLogoHeaderHtml } from '@/lib/brand/logo-inline';
import { BRAND_EMAIL_FOOTER, BRAND_EMAIL_TAGLINE } from '@/lib/brand/public-copy';

interface Brief {
  id: string;
  title: string;
  summary: string;
  trustScore: number;
  createdAt: string;
  verticalName: string;
  verticalColor?: string;
}

interface WeeklyBriefEmailProps {
  userName: string;
  selectedVerticals: string[];
  briefsByVertical: Record<string, Brief[]>;
  weekStart: string;
  weekEnd: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export function renderWeeklyBriefEmail({
  userName,
  selectedVerticals,
  briefsByVertical,
  weekStart,
  weekEnd,
  unsubscribeUrl,
  preferencesUrl,
}: WeeklyBriefEmailProps): string {
  const totalBriefs = Object.values(briefsByVertical).flat().length;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Intelligence Brief</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #000000;
      color: #ffffff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .tagline {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2em;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      margin-top: 6px;
    }
    .date-range {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.35);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      margin-top: 16px;
    }
    .intro {
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .intro-text {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.65);
      margin: 0 0 10px 0;
    }
    .verticals-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .vertical-tag {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .vertical-section {
      margin-bottom: 40px;
    }
    .vertical-header {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.35);
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }
    .brief-card {
      margin-bottom: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .trust-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      height: 36px;
      padding: 0 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 13px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      color: rgba(255, 255, 255, 0.75);
    }
    .brief-title {
      font-size: 16px;
      font-weight: 500;
      color: #ffffff;
      margin: 12px 0;
      line-height: 1.4;
    }
    .brief-summary {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.55);
      margin: 0 0 16px 0;
    }
    .read-button {
      display: inline-block;
      padding: 12px 24px;
      background: #ffffff;
      color: #000000;
      text-decoration: none;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      text-align: center;
    }
    .footer-links {
      margin-bottom: 20px;
    }
    .footer-link {
      display: inline-block;
      margin: 0 15px;
      color: rgba(255, 255, 255, 0.4);
      text-decoration: none;
      font-size: 12px;
    }
    .footer-link:hover {
      color: #ffffff;
    }
    .footer-text {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.3);
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${emailLogoHeaderHtml(20)}
      <div class="tagline">${BRAND_EMAIL_TAGLINE}</div>
      <div class="date-range">Week of ${weekStart} – ${weekEnd}</div>
    </div>

    <div class="intro">
      <p class="intro-text">
        ${userName ? `Hi ${userName},` : 'Hello,'}<br><br>
        Your personalized intelligence brief is ready. This week, we've curated <strong>${totalBriefs} executive brief${totalBriefs !== 1 ? 's' : ''}</strong> from your selected research verticals.
      </p>
      <div class="verticals-tags">
        ${selectedVerticals.map(v => `<span class="vertical-tag">${v}</span>`).join('')}
      </div>
    </div>

    ${Object.entries(briefsByVertical).map(([verticalName, briefs]) => `
      <div class="vertical-section">
        <h2 class="vertical-header">${verticalName}</h2>
        ${briefs.map(brief => `
          <div class="brief-card">
            <div class="trust-score">${brief.trustScore}</div>
            <h3 class="brief-title">${brief.title}</h3>
            <p class="brief-summary">${brief.summary}</p>
            <a href="https://nomosx.com/publications/${brief.id}" class="read-button">
              Read Full Brief
            </a>
          </div>
        `).join('')}
      </div>
    `).join('')}

    <div class="footer">
      <div class="footer-links">
        <a href="${preferencesUrl}" class="footer-link">Manage Preferences</a>
        <a href="https://nomosx.com/dashboard" class="footer-link">Dashboard</a>
        <a href="${unsubscribeUrl}" class="footer-link">Unsubscribe</a>
      </div>
      <p class="footer-text">
        You're receiving this because you subscribed to NomosX weekly briefs.<br>
        ${BRAND_EMAIL_FOOTER}<br>
        © 2026 NomosX. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function renderWeeklyBriefPlainText({
  userName,
  selectedVerticals,
  briefsByVertical,
  weekStart,
  weekEnd,
  unsubscribeUrl,
  preferencesUrl,
}: WeeklyBriefEmailProps): string {
  const totalBriefs = Object.values(briefsByVertical).flat().length;

  let text = `NOMOSX - Your Weekly Intelligence Brief\n`;
  text += `Week of ${weekStart} – ${weekEnd}\n\n`;
  text += `═══════════════════════════════════════════════════════════\n\n`;

  text += `${userName ? `Hi ${userName},` : 'Hello,'}\n\n`;
  text += `Your personalized intelligence brief is ready. This week, we've curated ${totalBriefs} executive brief${totalBriefs !== 1 ? 's' : ''} from your selected research verticals:\n\n`;
  text += selectedVerticals.map(v => `• ${v}`).join('\n');
  text += `\n\n`;

  Object.entries(briefsByVertical).forEach(([verticalName, briefs]) => {
    text += `\n${verticalName.toUpperCase()}\n`;
    text += `${'─'.repeat(60)}\n\n`;

    briefs.forEach(brief => {
      text += `${brief.title}\n`;
      text += `Trust Score: ${brief.trustScore}/100\n\n`;
      text += `${brief.summary}\n\n`;
      text += `Read more: https://nomosx.com/publications/${brief.id}\n\n`;
    });
  });

  text += `\n═══════════════════════════════════════════════════════════\n\n`;
  text += `Manage your preferences: ${preferencesUrl}\n`;
  text += `Dashboard: https://nomosx.com/dashboard\n`;
  text += `Unsubscribe: ${unsubscribeUrl}\n\n`;
  text += `You're receiving this because you subscribed to NomosX weekly briefs.\n`;
  text += `${BRAND_EMAIL_FOOTER}\n`;
  text += `© 2026 NomosX. All rights reserved.\n`;

  return text;
}
