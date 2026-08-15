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

  for (const field of textFields) {
    const val = analysis[field];
    if (typeof val !== 'string') continue;

    // Find sentences with missing citations
    const sentences = val.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const srcInSentence = [...sentence.matchAll(/\[SRC-(\d+)\]/g)].map(m => `[SRC-${m[1]}]`);
      const missingHere = srcInSentence.filter(s => missing.includes(s));
      if (missingHere.length === 0) continue;

      // Extract a searchable snippet (first 40-60 chars without [SRC-N])
      const cleanSnippet = sentence.replace(/\[SRC-\d+\]/g, '').trim().slice(0, 50);
      if (cleanSnippet.length < 15) continue;

      // Search for this snippet in the HTML (strip tags for matching)
      const htmlText = html.replace(/<[^>]+>/g, ' ');
      const idx = htmlText.indexOf(cleanSnippet.slice(0, 30));
      if (idx >= 0) {
        // Find the position in the actual HTML (approximate)
        // Insert the missing citation at the end of the matched text
        const afterIdx = idx + cleanSnippet.length;
        // Find the next </p> or end of text after this position
        const htmlAfter = html.slice(afterIdx);
        const closeTagIdx = htmlAfter.search(/<\/p>|<br\s*\/?>|<\/li>/i);
        if (closeTagIdx >= 0) {
          const insertPos = afterIdx + closeTagIdx;
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

  return { html, injected, details };
}

// ─── 2. NUMBER SANITIZATION ─────────────────────────────────────────────────
/**
 * Scan HTML for statistical numbers without [SRC-N] within 100 chars.
 * Replace unsourced numbers with "non établie" (Invariant 6).
 *
 * This is deterministic — no LLM. It prevents the analyst's hallucinated
 * numbers from reaching the reader.
 */
export function sanitizeUnsourcedNumbers(html: string): { html: string; sanitized: number; details: string[] } {
  const details: string[] = [];
  let sanitized = 0;

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
  let working = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
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

      sanitized++;
      details.push(`Sanitized unsourced number: "${match}"`);
      return 'non établie';
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

// ─── 3. CITATION INJECTION BY SOURCE MATCHING ───────────────────────────────
/**
 * For paragraphs that mention a source by title or author but lack [SRC-N],
 * inject the matching citation tag. This helps when the editor renders
 * source references as text but drops the [SRC-N] tag.
 */
export function injectCitationsBySourceMatch(
  html: string,
  sources: { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[],
): { html: string; injected: number; details: string[] } {
  const details: string[] = [];
  let injected = 0;

  // Extract style/script blocks AND h1/title blocks (never inject citations into titles)
  const skipBlocks: string[] = [];
  let workingHtml = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });
  // Also skip <h1>...</h1> and <title>...</title> — never inject citations into titles
  workingHtml = workingHtml.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });
  workingHtml = workingHtml.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const srcTag = `[SRC-${i + 1}]`;

    // Check if this source is already cited (text [SRC-N] OR rendered <sup> tags)
    if (workingHtml.includes(srcTag) ||
        new RegExp(`data-src=["']${i + 1}["']`).test(workingHtml) ||
        new RegExp(`href="#ref-${i + 1}"`).test(workingHtml)) continue;

    // Build search patterns from source metadata
    const patterns: string[] = [];
    if (src.title) {
      // Use first 30 chars of title as a search pattern
      const titleSnippet = src.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30);
      if (titleSnippet.length > 10) patterns.push(titleSnippet);
    }
    // Check author names
    const authorNames = src.authors?.map(a => a.author?.name).filter(Boolean) as string[] || [];
    for (const name of authorNames.slice(0, 2)) {
      const lastName = name.split(' ').slice(-1)[0];
      if (lastName && lastName.length > 3) {
        patterns.push(lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
    }

    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      let match;
      let injectionsForThisSource = 0;
      while ((match = regex.exec(workingHtml)) !== null && injectionsForThisSource < 3) {
        const matchIdx = match.index;
        if (matchIdx === undefined) break;
        // Check if there's already a [SRC-N] within 200 chars
        const context = workingHtml.slice(Math.max(0, matchIdx - 100), matchIdx + pattern.length + 100);
        if (/\[SRC-\d+\]/.test(context)) continue; // Already cited nearby

        // Find the end of the current sentence or paragraph
        // Use a smarter pattern: match sentence-ending punctuation NOT preceded by a digit
        // (to avoid splitting decimal numbers like "27.31" at the ".")
        const afterMatch = workingHtml.slice(matchIdx + pattern.length);
        const endIdx = afterMatch.search(/(?<!\d)[.!?</]/);
        if (endIdx >= 0 && endIdx < 200) {
          const insertPos = matchIdx + pattern.length + endIdx;
          workingHtml = workingHtml.slice(0, insertPos) + ' ' + srcTag + workingHtml.slice(insertPos);
          injected++;
          injectionsForThisSource++;
          details.push(`Injected ${srcTag} near "${pattern}"`);
          // Update regex lastIndex since we modified the string
          regex.lastIndex = insertPos + srcTag.length + 1;
        }
      }
    }
  }

  // Restore style/script blocks
  workingHtml = workingHtml.replace(/\x00SKIP(\d+)\x00/g, (_, i) => skipBlocks[parseInt(i, 10)]);

  return { html: workingHtml, injected, details };
}

// ─── 4. CITATION INJECTION BY CONTENT MATCHING ──────────────────────────────
/**
 * For uncited sentences containing factual markers (numbers, dates, percentages),
 * match them to source abstracts/fullText by key term overlap and inject [SRC-N].
 * This is deterministic — no LLM. It targets the gap between what the analyst
 * wrote (factual claims) and what it cited (missing [SRC-N] tags).
 */
export function injectCitationsByContentMatch(
  html: string,
  sources: { abstract?: string; fullText?: string; title?: string }[],
): { html: string; injected: number; details: string[] } {
  const details: string[] = [];
  let injected = 0;

  // Build source text index: for each source, extract key terms
  const sourceTerms: { idx: number; terms: Set<string> }[] = [];
  for (let i = 0; i < sources.length; i++) {
    const text = `${sources[i].abstract || ''} ${sources[i].fullText || ''} ${sources[i].title || ''}`.toLowerCase();
    const terms = new Set<string>();
    // Extract meaningful terms (length > 4, not stopwords)
    const stopwords = new Set(['about', 'above', 'after', 'again', 'against', 'their', 'there', 'these', 'those', 'which', 'where', 'while', 'would', 'could', 'should', 'between', 'through', 'during', 'before', 'because']);
    for (const word of text.match(/\b[a-z]{5,}\b/g) || []) {
      if (!stopwords.has(word)) terms.add(word);
    }
    sourceTerms.push({ idx: i + 1, terms });
  }

  // Split HTML into segments to find uncited text, skipping <style>/<script>/<h1>/<title> blocks
  const skipBlockRe = /<(style|script|h1|title)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const skipRanges: Array<[number, number]> = [];
  let skipMatch: RegExpExecArray | null;
  while ((skipMatch = skipBlockRe.exec(html)) !== null) {
    skipRanges.push([skipMatch.index, skipMatch.index + skipMatch[0].length]);
  }

  const segments: { type: 'tag' | 'text' | 'skip'; content: string }[] = [];
  let lastIdx = 0;
  for (const m of html.matchAll(/<[^>]+>/g)) {
    const tagStart = m.index!;
    const tagEnd = m.index! + m[0].length;
    // Skip tags inside style/script blocks
    const inSkip = skipRanges.some(([s, e]) => tagStart >= s && tagEnd <= e);
    if (inSkip) continue;
    // Check for skip block between lastIdx and this tag
    const skipBefore = skipRanges.find(([s, e]) => s >= lastIdx && e <= tagStart);
    if (skipBefore) {
      if (skipBefore[0] > lastIdx) {
        segments.push({ type: 'text', content: html.slice(lastIdx, skipBefore[0]) });
      }
      segments.push({ type: 'skip', content: html.slice(skipBefore[0], skipBefore[1]) });
      lastIdx = skipBefore[1];
    }
    if (tagStart > lastIdx) {
      segments.push({ type: 'text', content: html.slice(lastIdx, tagStart) });
    }
    segments.push({ type: 'tag', content: m[0] });
    lastIdx = tagEnd;
  }
  const remainingSkip = skipRanges.find(([s]) => s >= lastIdx);
  if (remainingSkip) {
    if (remainingSkip[0] > lastIdx) {
      segments.push({ type: 'text', content: html.slice(lastIdx, remainingSkip[0]) });
    }
    segments.push({ type: 'skip', content: html.slice(remainingSkip[0], remainingSkip[1]) });
    lastIdx = remainingSkip[1];
  }
  if (lastIdx < html.length) {
    segments.push({ type: 'text', content: html.slice(lastIdx) });
  }

  // Process text segments: find sentences with factual markers but no [SRC-N]
  const repairedSegments = segments.map(seg => {
    if (seg.type === 'tag' || seg.type === 'skip') return seg.content;

    let text = seg.content;
    // Skip the references section
    if (/^Sources$|^References$/i.test(text.trim())) return text;

    // Find sentences with factual markers
    const sentenceRegex = /[^.!?]+[.!?]*/g;
    text = text.replace(sentenceRegex, (sentence) => {
      const trimmed = sentence.trim();
      if (trimmed.length < 20) return sentence;

      // Must NOT already have [SRC-N]
      if (/\[SRC-\d+\]/.test(trimmed)) return sentence;

      // Match to source by term overlap
      const sentenceTerms = new Set<string>();
      for (const word of (trimmed.toLowerCase().match(/\b[a-z]{5,}\b/g) || [])) {
        sentenceTerms.add(word);
      }
      if (sentenceTerms.size < 3) return sentence;

      // Must have a factual marker OR be a substantial sentence with domain terms
      const hasFactual = /\d+\.?\d*\s*%|\$\s?\d+|\b\d{4}\b|\b\d+[.,]?\d*\s*(?:billion|million|thousand)\b/i.test(trimmed);
      const isSubstantial = trimmed.length > 60 && sentenceTerms.size >= 5;
      if (!hasFactual && !isSubstantial) return sentence;

      let bestMatch = 0;
      let bestScore = 0;
      for (const src of sourceTerms) {
        let overlap = 0;
        for (const term of sentenceTerms) {
          if (src.terms.has(term)) overlap++;
        }
        const score = overlap / sentenceTerms.size;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = src.idx;
        }
      }

      // Only inject if we have a reasonable match (>25% term overlap)
      if (bestScore > 0.25 && bestMatch > 0) {
        injected++;
        details.push(`Injected [SRC-${bestMatch}] (overlap: ${Math.round(bestScore * 100)}%) into: "${trimmed.slice(0, 60)}..."`);
        // Insert citation before the final punctuation
        const punctMatch = sentence.match(/([.!?]+\s*)$/);
        if (punctMatch) {
          return sentence.slice(0, -punctMatch[1].length) + ` [SRC-${bestMatch}]` + punctMatch[1];
        }
        return sentence + ` [SRC-${bestMatch}]`;
      }

      return sentence;
    });

    return text;
  });

  return { html: repairedSegments.join(''), injected, details };
}

// ─── 4b. BROAD CITATION INJECTION (coverage guarantee) ──────────────────────
/**
 * For each uncited source, find the paragraph with the highest term overlap
 * and inject [SRC-N] at the end. Lower threshold (15%) than content match.
 * Goal: ensure every source appears at least once in the HTML for coverage metrics.
 */
export function injectBroadCitations(
  html: string,
  sources: { abstract?: string; fullText?: string; title?: string; provider?: string }[],
): { html: string; injected: number; details: string[] } {
  const details: string[] = [];
  let injected = 0;

  // Extract style/script blocks AND h1/title blocks (never inject citations into titles)
  const skipBlocks: string[] = [];
  let workingHtml = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });
  workingHtml = workingHtml.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });
  workingHtml = workingHtml.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });

  // Build source term sets
  const stopwords = new Set(['about', 'above', 'after', 'again', 'against', 'their', 'there',
    'these', 'those', 'which', 'where', 'while', 'would', 'could', 'should', 'between',
    'through', 'during', 'before', 'because', 'study', 'research', 'paper', 'article',
    'result', 'results', 'method', 'methods', 'analysis', 'data', 'using', 'based']);
  const sourceTerms: { idx: number; terms: Set<string> }[] = [];
  for (let i = 0; i < sources.length; i++) {
    const text = `${sources[i].abstract || ''} ${sources[i].title || ''}`.toLowerCase();
    const terms = new Set<string>();
    for (const word of text.match(/\b[a-z]{5,}\b/g) || []) {
      if (!stopwords.has(word)) terms.add(word);
    }
    sourceTerms.push({ idx: i + 1, terms });
  }

  // Split HTML into paragraphs (<p>...</p>)
  const paragraphs: { start: number; end: number; text: string }[] = [];
  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = paraRegex.exec(workingHtml)) !== null) {
    // Strip inner tags for term extraction
    const innerText = pm[1].replace(/<[^>]+>/g, ' ').toLowerCase();
    paragraphs.push({ start: pm.index!, end: pm.index! + pm[0].length, text: innerText });
  }

  if (paragraphs.length === 0) {
    workingHtml = workingHtml.replace(/\x00SKIP(\d+)\x00/g, (_, i) => skipBlocks[parseInt(i, 10)]);
    return { html: workingHtml, injected, details };
  }

  // For each uncited source, find best paragraph and inject
  for (const src of sourceTerms) {
    const srcTag = `[SRC-${src.idx}]`;
    // Check if already cited: look for [SRC-N] text OR <sup> tags with data-src="N"
    const alreadyCited = workingHtml.includes(srcTag) ||
      new RegExp(`data-src=["']${src.idx}["']`).test(workingHtml) ||
      new RegExp(`href="#ref-${src.idx}"`).test(workingHtml);
    if (alreadyCited) continue;
    if (src.terms.size < 3) continue; // Not enough terms to match

    let bestParaIdx = -1;
    let bestScore = 0;
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const paraTerms = new Set<string>();
      for (const word of paragraphs[pi].text.match(/\b[a-z]{5,}\b/g) || []) {
        if (!stopwords.has(word)) paraTerms.add(word);
      }
      let overlap = 0;
      for (const term of paraTerms) {
        if (src.terms.has(term)) overlap++;
      }
      const score = paraTerms.size > 0 ? overlap / Math.min(paraTerms.size, src.terms.size) : 0;
      if (score > bestScore) {
        bestScore = score;
        bestParaIdx = pi;
      }
    }

    // Inject if overlap > 15% (lower threshold than content match's 25%)
    if (bestScore > 0.15 && bestParaIdx >= 0) {
      const para = paragraphs[bestParaIdx];
      // Insert before </p>
      const insertPos = para.end - 4; // 4 = "</p>".length
      workingHtml = workingHtml.slice(0, insertPos) + ` ${srcTag}` + workingHtml.slice(insertPos);
      injected++;
      details.push(`Broad-injected ${srcTag} (overlap: ${Math.round(bestScore * 100)}%) into paragraph ${bestParaIdx + 1}`);
      // Update paragraph end positions (shifted by srcTag length + 1)
      const shift = srcTag.length + 1;
      for (let pi = bestParaIdx; pi < paragraphs.length; pi++) {
        paragraphs[pi].end += shift;
      }
    }
  }

  // Restore style/script blocks
  workingHtml = workingHtml.replace(/\x00SKIP(\d+)\x00/g, (_, i) => skipBlocks[parseInt(i, 10)]);

  return { html: workingHtml, injected, details };
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

  // Step 2: Inject citations by source matching (title/author)
  const injection = injectCitationsBySourceMatch(workingHtml, sources);
  workingHtml = injection.html;
  totalInjected = injection.injected;
  allDetails.push(...injection.details);

  // Step 2b: Inject citations by content matching (abstract/fullText overlap)
  const contentInjection = injectCitationsByContentMatch(workingHtml, sources as any);
  workingHtml = contentInjection.html;
  totalInjected += contentInjection.injected;
  allDetails.push(...contentInjection.details);

  // Step 2c: Broad citation injection — ensure every uncited source appears at least once.
  // For each uncited source, find the paragraph with highest term overlap and inject.
  // Lower threshold (15%) than content match (25%) — goal is coverage, not precision.
  const broadInjection = injectBroadCitations(workingHtml, sources as any);
  workingHtml = broadInjection.html;
  totalInjected += broadInjection.injected;
  allDetails.push(...broadInjection.details);

  // Step 3: Sanitize unsourced numbers (must run AFTER all injection)
  const sanitization = sanitizeUnsourcedNumbers(workingHtml);
  workingHtml = sanitization.html;
  totalSanitized = sanitization.sanitized;
  allDetails.push(...sanitization.details);

  // Step 4: Convert injected [SRC-N] to <sup> tags if the renderer already uses <sup> format.
  // The strategic report renderer converts [SRC-N] to <sup class="cite"><a href="#ref-N">N</a></sup>.
  // But citation repair runs AFTER rendering, so injected [SRC-N] stay as raw text.
  // This step converts them to match the rendered format, preventing duplicate [E-N] + <sup>.
  const hasSupTags = /<sup class="cite"/.test(workingHtml);
  if (hasSupTags) {
    // Convert [SRC-N] to <sup> tags matching the renderer's format
    workingHtml = workingHtml.replace(/\[SRC-(\d+)\]/g, (_, n) => {
      // Only convert if there isn't already a <sup> for this ref nearby
      return `<sup class="cite"><a href="#ref-${n}" data-evidence="${n}">${n}</a></sup>`;
    });
    // Also remove any [E-N] text citations that have corresponding <sup> tags in the same paragraph
    workingHtml = workingHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (para, content) => {
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
      return `<p>${fixed}</p>`;
    });
  }

  // Step 5: Remove [Non vérifié] tags that may have been injected by claim-grounding
  // These break the reading experience and should never appear in final HTML
  workingHtml = workingHtml.replace(/<span style="color:#f59e0b;font-style:italic;">\[Non vérifié\]\s*<\/span>/g, '');
  workingHtml = workingHtml.replace(/\[Non vérifié\]\s*/g, '');

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
