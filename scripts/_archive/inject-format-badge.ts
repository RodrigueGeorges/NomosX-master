/**
 * Inject the format badge into an existing publication HTML.
 * Quick test without re-running the full pipeline.
 *
 * Usage:
 *   node --import tsx scripts/inject-format-badge.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs';
import { prisma } from '../lib/db';
import { getPublicationFormat } from '../lib/publication-formats';

async function main() {
  const pub = await prisma.thinkTankPublication.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!pub) {
    console.error('No publication found');
    process.exit(1);
  }

  console.log(`Publication: ${pub.id}`);
  console.log(`Type: ${pub.type}`);
  console.log(`Title: ${pub.title}`);

  const fmt = getPublicationFormat(pub.type);
  console.log(`Format: ${fmt.label} (${fmt.type})`);

  let html = pub.html || '';
  const badgeHtml = `<span class="format-badge" title="${fmt.description.replace(/"/g, '&quot;')}">${fmt.label}</span>`;

  // Check if badge already exists
  if (html.includes('class="format-badge"')) {
    console.log('Badge already present — replacing');
    html = html.replace(/<span class="format-badge"[^>]*>[^<]*<\/span>/, badgeHtml);
  } else if (html.includes('class="brief-meta"')) {
    // Inject at start of brief-meta content
    html = html.replace(
      /(<div class="brief-meta">)/,
      `$1${badgeHtml} `,
    );
    console.log('Badge injected into brief-meta');
  } else if (html.includes('class="report-meta"')) {
    html = html.replace(
      /(<div class="report-meta"[^>]*>)/,
      `$1${badgeHtml} `,
    );
    console.log('Badge injected into report-meta');
  } else {
    console.error('No meta div found in HTML');
    process.exit(1);
  }

  // Add CSS for format-badge if not present
  if (!html.includes('.format-badge {')) {
    const badgeCss = `
  .format-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f0f0fa;
    background: rgba(240, 240, 250, 0.08);
    border: 1px solid rgba(240, 240, 250, 0.18);
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
    margin-right: 0.5rem;
    vertical-align: middle;
  }`;
    // Inject before </style>
    html = html.replace(/<\/style>/, `${badgeCss}\n<\/style>`);
    console.log('CSS injected');
  }

  // Save to file
  fs.writeFileSync('scripts/output-funnel.html', html, 'utf-8');
  console.log(`HTML saved: scripts/output-funnel.html (${html.length} chars)`);

  // Update DB
  await prisma.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('DB updated');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
