/**
 * Deterministic Citation Repair — post-render HTML cleanup.
 *
 * Problem: The LLM analyst generates numbers without [SRC-N] citations,
 * and the editor render can drop [SRC-N] tags. This produces:
 * - 71 unsourced numbers → numerical gate violations
 * - NLI integrity 40% → claims don't match sources
 * - Grounding veto → trust score capped at 40
 *
 * Solution (deterministic, no LLM — Invariant 5):
 * 1. CITATION BACKFILL: Scan analyst JSON for [SRC-N] tags that are missing
 *    from the rendered HTML and inject them at the matching claim location.
 * 2. NUMBER SANITIZATION: Scan HTML for statistical numbers (%, $B, ratios)
 *    without [SRC-N] within 100 chars and replace with "non établie".
 * 3. CITATION INJECTION: For paragraphs that mention a source title/author
 *    but lack [SRC-N], inject the matching citation tag.
 *
 * This is code, not LLM. It runs after the editor render and before the
 * critical loop. It cannot add new claims — only repair missing citations
 * or neutralize unsourced numbers.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CitationRepairResult {
  html: string;
  citationsInjected: number;
  numbersSanitized: number;
  citationsBackfilled: number;
  details: string[];
}

// ─── 1. CITATION BACKFILL ───────────────────────────────────────────────────
/**
 * The analyst JSON contains [SRC-N] tags in text fields (verdict, causalChain,
 * keyFindings, etc.) but the editor render may drop them when converting to HTML.
 * This function extracts [SRC-N] from the analyst JSON and checks if they
 * appear in the HTML. If missing, it tries to inject them near matching text.
 */
export function backfillCitationsFromAnalysis(
  html: string,
  analysis: Record<string, unknown>,
  sourceCount: number,
): { html: string; injected: number; details: string[] } {
  let injected = 0;
  const details: string[] = [];

  // Extract all [SRC-N] from analysis JSON text fields
  const analysisText = JSON.stringify(analysis);
  const analysisCitations = new Set<string>();
  for (const m of analysisText.matchAll(/\[SRC-(\d+)\]/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= sourceCount) {
      analysisCitations.add(`[SRC-${n}]`);
    }
  }

  // Check which citations are present in HTML
  const htmlCitations = new Set<string>();
  for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) {
    htmlCitations.add(`[SRC-${m[1]}]`);
  }

  const missing = [...analysisCitations].filter(c => !htmlCitations.has(c));
  if (missing.length === 0) {
    return { html, injected: 0, details };
  }

  // Try to inject missing citations by finding text snippets from the analysis
  // that contain the missing [SRC-N] and matching them to the HTML
  const textFields = ['verdict', 'summary', 'consensus', 'evidence', 'implications',
    'risks', 'open_questions', 'what_changes_mind', 'anchoringBasis', 'throughLine'];

  // Multipass substance lives in structured fields (frictionMap.mechanisms[],
  // causalChain[], keyFindings[], dataLandscape). Snippet-matching is the
  // guard — JSON text that never appears verbatim in the HTML simply won't
  // match, so serializing them is safe and only restores analyst-authored
  // citations the renderer dropped.
  const extraStructured = ['frictionMap', 'causalChain', 'keyFindings',
    'dataLandscape', 'whatToWatch', 'rejectedAlternatives', 'scenarios'];
  const candidateTexts: string[] = [];
  for (const field of textFields) {
    const val = analysis[field];
    if (typeof val === 'string') candidateTexts.push(val);
  }
  for (const field of extraStructured) {
    const val = analysis[field];
    if (val != null && typeof val !== 'string') {
      candidateTexts.push(JSON.stringify(val));
    }
  }

  for (const val of candidateTexts) {

    // Find sentences with missing citations.
    // CRITICAL: Don't split on '.' between digits (decimal points like "0.5").
    // The lookbehind (?<=[.!?]) matches any of .!? followed by whitespace.
    // To avoid splitting "0.5 " as a sentence boundary, we use a negative
    // lookbehind for digits: (?<!\d) before the [.!?].
    const sentences = val.split(/(?<=[.!?])(?<!\d)\s+/);
    for (const sentence of sentences) {
      const srcInSentence = [...sentence.matchAll(/\[SRC-(\d+)\]/g)].map(m => `[SRC-${m[1]}]`);
      const missingHere = srcInSentence.filter(s => missing.includes(s));
      if (missingHere.length === 0) continue;

      // Extract a searchable snippet (first 40-60 chars without [SRC-N])
      const cleanSnippet = sentence.replace(/\[SRC-\d+\]/g, '').trim().slice(0, 50);
      if (cleanSnippet.length < 15) continue;

      // Search for this snippet in the HTML body only (exclude <style>/<script>/<head>)
      // Strip tags AND skip CSS/script content to avoid position mismatch
      const bodyOnly = html.replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
                           .replace(/<[^>]+>/g, ' ');
      const idx = bodyOnly.indexOf(cleanSnippet.slice(0, 30));
      if (idx >= 0) {
        // Find the position in the actual HTML body (not in CSS/head)
        // Insert the missing citation at the end of the matched text
        const afterIdx = idx + cleanSnippet.length;
        // Find the next </p> or end of text after this position in the body-only text
        const bodyAfter = bodyOnly.slice(afterIdx);
        const closeTagIdx = bodyAfter.search(/<\/p>|<br\s*\/?>|<\/li>/i);
        if (closeTagIdx >= 0) {
          // Map back to original HTML: find the close tag in the original HTML
          // by searching for the same tag pattern after the approximate position
          const approxPos = afterIdx + closeTagIdx;
          // Find the actual position in the original HTML by searching for </p>/<br>/<li>
          // starting from a position that accounts for tag length differences
          const searchStart = Math.max(0, approxPos - 50);
          const htmlSlice = html.slice(searchStart);
          const tagMatch = htmlSlice.search(/<\/p>|<br\s*\/?>|<\/li>/i);
          if (tagMatch >= 0) {
            const insertPos = searchStart + tagMatch;
            // Verify we're not inside a <style> block or a data-no-cite protected zone
            const beforeInsert = html.slice(Math.max(0, insertPos - 500), insertPos);
            if (/<style/i.test(beforeInsert) && !/<\/style>/i.test(beforeInsert)) {
              continue; // Skip — would insert inside CSS
            }
            // Check if we're inside a data-no-cite protected zone
            // Count open/close tags with data-no-cite before this position
            const noCiteOpens = (beforeInsert.match(/<(\w+)\b[^>]*\bdata-no-cite\b[^>]*>/gi) || []).length;
            const noCiteCloses = (beforeInsert.match(/<\/(\w+)>/gi) || []).filter((closeTag, i) => {
              // Check if the corresponding open tag had data-no-cite
              // Simple heuristic: if there are more opens than closes, we're inside
              return i >= 0;
            }).length;
            // Simpler: check if the nearest enclosing element has data-no-cite
            const lastNoCiteOpen = beforeInsert.lastIndexOf('data-no-cite');
            const lastCloseTag = beforeInsert.lastIndexOf('</');
            if (lastNoCiteOpen > lastCloseTag) {
              continue; // Skip — would inject inside a protected zone
            }
            const citations = missingHere.join('');
            html = html.slice(0, insertPos) + ' ' + citations + html.slice(insertPos);
            injected += missingHere.length;
            details.push(`Backfilled ${missingHere.join(', ')} near "${cleanSnippet.slice(0, 30)}..."`);
            // Remove from missing list
            for (const c of missingHere) {
              const i = missing.indexOf(c);
              if (i >= 0) missing.splice(i, 1);
            }
          }
        }
      }
    }
  }

  return { html, injected, details };
}

// ─── 2. NUMBER SANITIZATION ─────────────────────────────────────────────────
/**
 * Scan HTML for statistical numbers without [SRC-N] within 100 chars.
 * Replace unsourced numbers with a language-matched marker ("non établie" /
 * "not established") — Invariant 6.
 *
 * This is deterministic — no LLM. It prevents the analyst's hallucinated
 * numbers from reaching the reader.
 */
export function sanitizeUnsourcedNumbers(html: string): { html: string; sanitized: number; details: string[] } {
  const details: string[] = [];
  let sanitized = 0;

  // Replacement text must match the artifact's language — the hardcoded
  // French "non établie" was observed injected into English publications
  // (paid run: 9 + 15 sanitizations on an English brief).
  const plainText = html.replace(/<[^>]+>/g, ' ').slice(0, 20000);
  const frenchWords = plainText.match(/\b(le|la|les|des|une|dans|pour|avec|nous|notre|que|qui|est|sont|cette|ces|aux|par|sur|entre|selon)\b/gi) ?? [];
  const wordTotal = plainText.split(/\s+/).filter(Boolean).length;
  const replacement = wordTotal > 0 && frenchWords.length / wordTotal > 0.06 ? 'non établie' : 'not established';

  // Pattern: numbers that look like statistics
  // - Percentages: 92%, 92.7%
  // - Dollar amounts: $2B, $2.5M
  // - Decimals with 2+ decimal places: 0.85
  // - Large integers: 2000+ (but not years 1900-2099, checked below)
  const statPattern = /(?<![\w-])(\d+\.?\d*\s*%|\$\s?\d+\.?\d*\s*[BbMmKk]|\b\d+\.\d{2,}\b|\b[1-9]\d{3,}\b)(?![\w-])/g;

  // ── APPROACH: Replace <style>/<script> blocks with placeholders, then
  //    process text nodes (between > and <) using the FULL HTML context
  //    to check for nearby <sup> citation tags. ──

  // Step 1: Extract and mask <style>/<script> blocks
  const skipBlocks: string[] = [];
  let working = html.replace(/<(style|script)\b[^>]*>[\s\S]*?(<\/\1>|(?=<\/head>)|(?=<body\b)|$)/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });

  // The central-scenario block must render the persisted editorial decision
  // VERBATIM — the publication gate compares each field for equality, and the
  // arbiter's own numbers (e.g. "confidence is 68%, not 85%") are authored
  // content, not source claims. Sanitizing them rewrites the decision ("not
  // established, not not established" — observed on the S38 paid run) and
  // guarantees a central_scenario hold. Mask the whole block like <style>.
  working = working.replace(/<section\b[^>]*class="[^"]*nx-block central-scenario[^"]*"[^>]*>[\s\S]*?<\/section>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });

  // Step 2: Find all text nodes (content between > and <) and process numbers
  // We use a regex that matches text between tags: >text<
  // The position in `working` gives us the full HTML context for citation checks
  working = working.replace(/>([^<]+)</g, (fullMatch, textContent: string, offset: number) => {
    // Skip if this text node is inside a <title> or <h1> tag (check context)
    // Actually, we process all text nodes — the context checks below handle edge cases

    // Process numbers in this text node
    const fixedText = textContent.replace(statPattern, (match, _g1, matchOffset: number) => {
      // matchOffset is relative to textContent, not the full HTML.
      // We need the absolute position in `working` to check for <sup> tags.
      // offset is the position of the full match (>) in working.
      // The text content starts at offset + 1 (after the >).
      const absPos = offset + 1 + matchOffset;
      const absEnd = absPos + match.length;

      // Check full HTML context for citations (both [SRC-N] text and <sup> tags)
      const ctxBefore = working.slice(Math.max(0, absPos - 200), absPos);
      const ctxAfter = working.slice(absEnd, absEnd + 200);

      // Check for rendered <sup> citation tags nearby
      if (/<sup class="cite"/.test(ctxAfter) || /<\/sup>/.test(ctxBefore)) {
        return match; // Citation present, keep the number
      }

      // Check for [SRC-N] or [E-N] text citations nearby
      if (/\[(?:SRC|E)-\d+\]/.test(ctxAfter) || /\[(?:SRC|E)-\d+\]/.test(ctxBefore)) {
        return match;
      }

      // Don't sanitize years (1900-2099)
      const yearMatch = match.match(/^\b(19\d{2}|20\d{2})\b$/);
      if (yearMatch) return match;

      // Don't sanitize if this number is part of a larger word
      const charBefore = textContent.slice(Math.max(0, matchOffset - 1), matchOffset);
      const charAfter = textContent.slice(matchOffset + match.length, matchOffset + match.length + 1);
      if (/[a-zA-Z]/.test(charBefore) || /[a-zA-Z]/.test(charAfter)) {
        return match;
      }

      // Don't sanitize numbers inside URLs, DOIs, or anchor tags
      const urlContext = working.slice(Math.max(0, absPos - 100), absEnd + 100);
      if (/doi\.org|https?:\/\/|href=|src=|\.com|\.org|\.net|\.gov|\.edu/i.test(urlContext)) {
        return match;
      }

      // Don't sanitize if inside the Sources/References section
      // (check if we're inside a <span class="apa-ref"> or <div class="source-item">)
      const sectionCtx = working.slice(Math.max(0, absPos - 500), absPos);
      if (/class="apa-ref"|class="source-item"|<h2>Sources<\/h2>/.test(sectionCtx)) {
        return match;
      }

      // Don't sanitize numbers inside the Methodology & Transparency section
      // (these are pipeline metrics like trust score, citation coverage, etc.)
      const methodologyCtx = working.slice(Math.max(0, absPos - 1000), absPos);
      if (/class="nx-block methodology-note"|Méthodologie|TRUST|nx-eyebrow/.test(methodologyCtx)) {
        return match;
      }

      // Don't sanitize model-derived estimates: data-no-cite zones and
      // scenario-prob spans (Delphi-calibrated probabilities are internal
      // estimates, not empirical claims requiring a source)
      const openTag = ctxBefore.match(/<([a-zA-Z][^>]*)>$/)?.[1] || '';
      if (/\bdata-no-cite\b/.test(openTag) || /class="[^"]*\bscenario-prob\b/.test(openTag)) {
        return match;
      }

      sanitized++;
      details.push(`Sanitized unsourced number: "${match}"`);
      return replacement;
    });

    return `>${fixedText}<`;
  });

  // Step 3: Restore <style>/<script> blocks
  working = working.replace(/\x00SKIP(\d+)\x00/g, (_, i) => skipBlocks[parseInt(i, 10)]);

  return {
    html: working,
    sanitized,
    details,
  };
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────

export function repairCitations(
  html: string,
  analysis: Record<string, unknown>,
  sources: { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[],
): CitationRepairResult {
  const allDetails: string[] = [];
  let workingHtml = html;
  let totalInjected = 0;
  let totalSanitized = 0;
  let totalBackfilled = 0;

  // Step 1: Backfill citations from analyst JSON
  const backfill = backfillCitationsFromAnalysis(workingHtml, analysis, sources.length);
  workingHtml = backfill.html;
  totalBackfilled = backfill.injected;
  allDetails.push(...backfill.details);

  // OT-cleanup: all lexical-similarity citation injection removed (steps 2,
  // 2b, 2c). Matching a paragraph to a source by title/author/term overlap
  // fabricated grounding — a citation asserts the source supports the claim,
  // which only the claim-to-passage evidence contract can establish. What
  // remains: backfill from the analyst's own declared citations, number
  // sanitization, and format normalization.

  // Step 3: Sanitize unsourced numbers (must run AFTER all injection)
  const sanitization = sanitizeUnsourcedNumbers(workingHtml);
  workingHtml = sanitization.html;
  totalSanitized = sanitization.sanitized;
  allDetails.push(...sanitization.details);

  // Step 3b: Language-normalize the "non établie" marker. Invariant 6 is
  // intentional epistemic honesty — but the FRENCH token inside an ENGLISH
  // publication reads as a rendering bug to paying readers. Detect document
  // language from prose and localize the marker (covers both the sanitizer's
  // output above and tokens the LLM wrote itself per prompt instructions).
  {
    const visibleText = workingHtml
      .replace(/<(style|script)\b[\s\S]*?(<\/\1>|$)/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ');
    const words = visibleText.split(/\s+/).filter(w => w.length > 1);
    const frenchWords = words.filter(w => /^(le|la|les|des|une|est|dans|pour|avec|qui|sur|nous|leur|être|sont|cette|ces|aux|par|entre|selon|dont|aussi|mais|comme|plus|très|sans|sous|vers|après|avant|pendant|depuis|jusqu|lors|ainsi|alors|donc|car|ni|ou|et|de|du|en|au|un|il|elle|on|ce|se|sa|son|ses)$/i.test(w)).length;
    const isFrench = words.length > 0 && frenchWords / words.length > 0.06;
    if (!isFrench) {
      workingHtml = workingHtml.replace(/non établie/g, 'not established');
    }
  }

  // Step 4: Convert injected [SRC-N] to <sup> tags if the renderer already uses <sup> format.
  // The strategic report renderer converts [SRC-N] to <sup class="cite"><a href="#ref-N">N</a></sup>.
  // But citation repair runs AFTER rendering, so injected [SRC-N] stay as raw text.
  // This step converts them to match the rendered format, preventing duplicate [E-N] + <sup>.
  // CRITICAL: Must skip <style>/<script> blocks — [SRC-N] in CSS would corrupt the layout.
  // CRITICAL: Produce [SRC-N] text (NOT <sup> HTML) so that replaceSrcWithEvidenceIds
  // can uniformly convert ALL citations to data-evidence="EN" format later.
  // Producing <sup data-evidence="N"> here would create duplicates with <sup data-evidence="EN">.
  const hasSupTags = /<sup class="cite"/.test(workingHtml);
  if (hasSupTags) {
    // Mask <style>/<script> blocks before conversion
    const skipBlocks4: string[] = [];
    let masked = workingHtml.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
      skipBlocks4.push(m);
      return `\x00SKIP4_${skipBlocks4.length - 1}\x00`;
    });
    // Convert [SRC-N] to <sup> tags matching the renderer's format (NO data-evidence attribute —
    // replaceSrcWithEvidenceIds will add the correct data-evidence="EN" later)
    masked = masked.replace(/\[SRC-(\d+)\]/g, (_, n) => {
      return `<sup class="cite"><a href="#ref-${n}">${n}</a></sup>`;
    });
    // Restore <style>/<script> blocks
    workingHtml = masked.replace(/\x00SKIP4_(\d+)\x00/g, (_, i) => skipBlocks4[parseInt(i, 10)]);
    // Also remove any [E-N] text citations that have corresponding <sup> tags in the same paragraph
    // CRITICAL: Preserve original <p> attributes (class, style) — don't strip them
    workingHtml = workingHtml.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (para, attrs, content) => {
      const supIds = new Set<string>();
      for (const m of content.matchAll(/<sup class="cite"><a href="#ref-(\d+)"/g)) {
        supIds.add(m[1]);
      }
      if (supIds.size === 0) return para;
      let fixed = content;
      for (const id of supIds) {
        // Remove [E-N] text citations that duplicate <sup> tags
        fixed = fixed.replace(new RegExp(`\\s*\\[E${id}\\]\\s*`, 'g'), ' ');
      }
      return `<p${attrs}>${fixed}</p>`;
    });
  }

  // Step 5: Remove [Non vérifié] tags that may have been injected by claim-grounding
  // These break the reading experience and should never appear in final HTML
  workingHtml = workingHtml.replace(/<span style="color:#f59e0b;font-style:italic;">\[Non vérifié\]\s*<\/span>/g, '');
  workingHtml = workingHtml.replace(/\[Non vérifié\]\s*/g, '');

  // Step 6: Safety net — strip any HTML tags that leaked into <style> blocks.
  // Citation injection/repair should never modify CSS, but if any <sup> or [SRC-N]
  // tags ended up inside <style>, remove them to prevent layout corruption.
  workingHtml = workingHtml.replace(
    /(<(style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_, openTag, _tag, cssContent, closeTag) => {
      // Remove any injected <sup> tags, [SRC-N], or [E-N] from CSS
      const cleaned = cssContent
        .replace(/<sup class="cite"[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/\[SRC-\d+\]/g, '')
        .replace(/\[E\d+\]/g, '')
        .replace(/\s{2,}/g, ' '); // Collapse multiple spaces left by removals
      return `${openTag}${cleaned}${closeTag}`;
    }
  );

  const total = totalBackfilled + totalInjected + totalSanitized;
  console.log(`[CITATION REPAIR] Backfilled: ${totalBackfilled}, Injected: ${totalInjected}, Sanitized: ${totalSanitized} (total: ${total})`);

  return {
    html: workingHtml,
    citationsInjected: totalInjected,
    numbersSanitized: totalSanitized,
    citationsBackfilled: totalBackfilled,
    details: allDetails.slice(0, 20), // Cap details to avoid huge logs
  };
}
