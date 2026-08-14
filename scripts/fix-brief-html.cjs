require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Get the latest PUBLISHED brief
  const pub = await p.thinkTankPublication.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, html: true, sourceIds: true },
  });

  if (!pub) {
    console.log('No PUBLISHED brief found');
    return;
  }

  console.log('Repairing:', pub.title?.slice(0, 80));
  let html = pub.html || '';
  const originalLen = html.length;

  // Count issues before
  const before = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    '[E-N] text': (html.match(/\[E\d+\]/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };
  console.log('\nBefore:', before);

  // ── FIX 1: Remove "non établie" from CSS <style> blocks ──
  // The sanitizer replaced numbers inside CSS. Restore common CSS values.
  html = html.replace(/<(style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    return block
      // Fix width: non établie → width: 100%
      .replace(/width:\s*non établie/g, 'width: 100%')
      // Fix any CSS property: non établie → 0
      .replace(/:\s*non établie/g, ': 0')
      // Fix non établie% → 100%
      .replace(/non établie%/g, '100%')
      // Fix non établiepx → 0px
      .replace(/non établiepx/g, '0px')
      // Fix non établierem → 0rem
      .replace(/non établierem/g, '0rem')
      // Remove any remaining non établie in CSS
      .replace(/non établie/g, '0');
  });

  // ── FIX 1b: Remove "non établie" from inline styles ──
  // style="...non établie..." → style="...0..."
  html = html.replace(/style="([^"]*)"/g, (match, styleContent) => {
    const fixed = styleContent
      .replace(/width:\s*non établie/g, 'width: 100%')
      .replace(/:\s*non établie/g, ': 0')
      .replace(/non établie%/g, '100%')
      .replace(/non établiepx/g, '0px')
      .replace(/non établie/g, '0');
    return `style="${fixed}"`;
  });

  // ── FIX 2: Remove [Non vérifié] tags ──
  // These were injected by claim-grounding and should not appear in final HTML
  html = html.replace(/<span style="color:#f59e0b;font-style:italic;">\[Non vérifié\]\s*<\/span>/g, '');
  html = html.replace(/\[Non vérifié\]\s*/g, '');

  // ── FIX 3: Fix "Unknown Author" in source references ──
  // Replace "Unknown Author (YEAR)" with just the title/year
  html = html.replace(/Unknown Author \((\d{4})\)\.\s*/g, '($1). ');
  // Also fix "Unknown Author" without year
  html = html.replace(/Unknown Author\.\s*/g, '');
  html = html.replace(/Unknown Author,?\s*/g, '');

  // ── FIX 4: Fix broken DOIs ──
  // doi.org/non établie → remove the DOI link entirely
  html = html.replace(/<a[^>]*href="https?:\/\/doi\.org\/non[^"]*"[^>]*>[^<]*<\/a>/gi, '');
  html = html.replace(/doi\.org\/non établie[^\s<]*/gi, '');
  // Also fix any remaining "non établie" in href attributes
  html = html.replace(/href="([^"]*non établie[^"]*)"/g, 'href="#"');

  // ── FIX 5: Remove electricity/energy data sections (off-topic for finance) ──
  // Remove paragraphs containing electricity price data
  html = html.replace(/<p[^>]*>[^<]*(?:Day-ahead electricity|EUR \/ MWh|electricity prices|day-ahead price)[^<]*<\/p>/gi, '');
  // Remove <li> items with electricity data
  html = html.replace(/<li[^>]*>[^<]*(?:Day-ahead electricity|EUR \/ MWh|electricity prices)[^<]*<\/li>/gi, '');
  // Remove table rows with electricity data
  html = html.replace(/<tr[^>]*>[\s\S]*?(?:Day-ahead electricity|EUR \/ MWh)[\s\S]*?<\/tr>/gi, '');

  // ── FIX 6: Fix duplicate citations [E-N] text + <sup> tags ──
  // The HTML has both [E4] text and <sup class="cite"><a href="#ref-4" data-evidence="E4">E4</a></sup>
  // Remove the text [E-N] when a <sup> tag follows within 50 chars
  html = html.replace(/\s*\[E(\d+)\]\s*(?=[^<]{0,50}<sup class="cite"><a href="#ref-\1")/g, '');

  // Also remove standalone [E-N] text citations that have corresponding <sup> tags elsewhere
  // Pattern: "text [E4] more text" where [E4] is redundant with <sup> E4
  // Only remove if there's a <sup> with the same evidence ID in the same paragraph
  html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (para, content) => {
    // Find all evidence IDs in <sup> tags within this paragraph
    const supIds = new Set();
    for (const m of content.matchAll(/<sup class="cite"><a href="#ref-(\d+)"/g)) {
      supIds.add(m[1]);
    }
    // Remove [E-N] text citations that have matching <sup> tags
    let fixed = content;
    for (const id of supIds) {
      fixed = fixed.replace(new RegExp(`\\s*\\[E${id}\\]\\s*`, 'g'), ' ');
    }
    return `<p>${fixed}</p>`;
  });

  // ── FIX 7: Remove "non établie" from body text (legitimate numbers were broken) ──
  // In body text, "non établie" replaced real numbers. We can't recover the original numbers,
  // but we should at least clean up the broken text.
  // Replace "non établie decline" → "a decline"
  // Replace "non établie of" → "" (remove)
  // Replace "non établie uninsured" → "uninsured" (remove the broken number)
  // Only in text content, not in CSS
  const styleBlocks = [];
  let textHtml = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    styleBlocks.push(m);
    return `\x00STYLE${styleBlocks.length - 1}\x00`;
  });

  // Clean up "non établie" in body text
  textHtml = textHtml
    // "non établie decline" → "a decline"
    .replace(/\bnon établie decline/g, 'a decline')
    // "non établie of its" → "of its"
    .replace(/\bnon établie of (its|the|a)\b/g, '$1')
    // "non établie uninsured" → "uninsured"
    .replace(/\bnon établie uninsured/g, 'uninsured')
    // "had non établie" → "had"
    .replace(/\bnon établie /g, '')
    // Clean up double spaces
    .replace(/  +/g, ' ');

  // Restore style blocks
  html = textHtml.replace(/\x00STYLE(\d+)\x00/g, (_, i) => styleBlocks[parseInt(i, 10)]);

  // Count issues after
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    '[E-N] text': (html.match(/\[E\d+\]/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };
  console.log('\nAfter:', after);
  console.log('\nHTML length:', originalLen, '→', html.length);

  // Show samples of remaining issues
  if (after['non établie'] > 0) {
    const idx = html.indexOf('non établie');
    if (idx > 0) {
      const context = html.slice(Math.max(0, idx - 100), idx + 100);
      // Check if it's in a style block
      const inStyle = context.includes('<style') || context.includes('}');
      console.log('\nRemaining "non établie" sample:', inStyle ? '(in CSS)' : '(in text)', context.slice(0, 200));
    }
  }

  // Save the fixed HTML
  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Fixed HTML saved to DB for publication:', pub.id);

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
