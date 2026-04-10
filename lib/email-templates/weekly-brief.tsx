/**
 * Weekly Brief Email Template
 * 
 * Personalized intelligence delivery based on user's vertical preferences
 * Sent weekly with latest Executive Briefs from selected verticals
 */

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
      background-color: #0B0B0D;
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .logo-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #12121A 0%, #1A1A28 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .logo-text-accent {
      color: #6366F1;
    }
    .date-range {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
    .intro {
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(99, 102, 241, 0.05);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 8px;
    }
    .intro-text {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.7);
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
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 12px;
      font-size: 11px;
      color: #6366F1;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .vertical-section {
      margin-bottom: 40px;
    }
    .vertical-header {
      font-size: 18px;
      font-weight: 500;
      color: #6366F1;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(99, 102, 241, 0.2);
    }
    .brief-card {
      margin-bottom: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      transition: border-color 0.2s;
    }
    .brief-card:hover {
      border-color: rgba(99, 102, 241, 0.3);
    }
    .brief-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .trust-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #10B981;
    }
    .brief-title {
      font-size: 16px;
      font-weight: 500;
      color: #ffffff;
      margin: 0 0 12px 0;
      line-height: 1.4;
    }
    .brief-summary {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.6);
      margin: 0 0 16px 0;
    }
    .read-button {
      display: inline-block;
      padding: 10px 20px;
      background: linear-gradient(135deg, #6366F1 0%, #7C3AED 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .read-button:hover {
      opacity: 0.9;
    }
    .footer {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
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
      color: #6366F1;
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
    <!-- Header -->
    <div class="header">
      <div class="logo">
        <div class="logo-icon">
          <svg width="20" height="20" viewBox="0 0 120 120" fill="none">
            <defs>
              <linearGradient id="emailLogoGradient" x1="30%" y1="0%" x2="70%" y2="100%">
                <stop offset="0%" style="stop-color:#6366F1;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4A7FE0;stop-opacity:1" />
              </linearGradient>
            </defs>
            <path d="M 25 30 L 25 90 L 33 90 L 33 30 Z" fill="url(#emailLogoGradient)"/>
            <path d="M 33 35 L 60 60 L 87 85 L 93 80 L 60 53 L 33 28 Z" fill="url(#emailLogoGradient)"/>
            <path d="M 87 35 L 60 60 L 33 85 L 27 80 L 60 53 L 87 28 Z" fill="url(#emailLogoGradient)" opacity="0.9"/>
            <path d="M 87 30 L 87 90 L 95 90 L 95 30 Z" fill="url(#emailLogoGradient)"/>
            <circle cx="60" cy="60" r="6" fill="white"/>
            <circle cx="60" cy="60" r="3" fill="#6366F1"/>
          </svg>
        </div>
        <span class="logo-text">Nomos<span class="logo-text-accent">X</span></span>
      </div>
      <div class="date-range">Week of ${weekStart} – ${weekEnd}</div>
    </div>

    <!-- Intro -->
    <div class="intro">
      <p class="intro-text">
        ${userName ? `Hi ${userName},` : 'Hello,'}<br><br>
        Your personalized intelligence brief is ready. This week, we've curated <strong>${totalBriefs} executive brief${totalBriefs !== 1 ? 's' : ''}</strong> from your selected research verticals.
      </p>
      <div class="verticals-tags">
        ${selectedVerticals.map(v => `<span class="vertical-tag">${v}</span>`).join('')}
      </div>
    </div>

    <!-- Briefs by Vertical -->
    ${Object.entries(briefsByVertical).map(([verticalName, briefs]) => `
      <div class="vertical-section">
        <h2 class="vertical-header">${verticalName}</h2>
        ${briefs.map(brief => `
          <div class="brief-card">
            <div class="brief-header">
              <div class="trust-score">${brief.trustScore}</div>
            </div>
            <h3 class="brief-title">${brief.title}</h3>
            <p class="brief-summary">${brief.summary}</p>
            <a href="https://nomosx.com/publications/${brief.id}" class="read-button">
              Read Full Brief →
            </a>
          </div>
        `).join('')}
      </div>
    `).join('')}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-links">
        <a href="${preferencesUrl}" class="footer-link">Manage Preferences</a>
        <a href="https://nomosx.com/dashboard" class="footer-link">Dashboard</a>
        <a href="${unsubscribeUrl}" class="footer-link">Unsubscribe</a>
      </div>
      <p class="footer-text">
        You're receiving this because you subscribed to NomosX weekly briefs.<br>
        NomosX · The Autonomous Think Tank<br>
        © 2026 NomosX. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Plain text version for email clients that don't support HTML
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
  text += `NomosX · The Autonomous Think Tank\n`;
  text += `© 2026 NomosX. All rights reserved.\n`;

  return text;
}
