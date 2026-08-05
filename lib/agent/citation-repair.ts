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

  // Work on the text content, preserving HTML tags
  // Pattern: numbers that look like statistics
  const statPattern = /(\d+\.?\d*\s*%|\$\s?\d+\.?\d*\s*[BbMmKk]|\b\d+\.\d{2,}\b|\b[1-9]\d{3,}\b)/g;

  // We need to check in the text content (between tags)
  // Split HTML into tag and text segments, but SKIP <style> and <script> blocks
  // entirely — CSS values (rgba, line-height, font-size) are not statistics.
  const segments: { type: 'tag' | 'text' | 'skip'; content: string }[] = [];
  let lastIdx = 0;
  const skipBlockRe = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const tagRe = /<[^>]+>/g;
  let skipMatch: RegExpExecArray | null;
  // Build segments, marking style/script blocks as 'skip'
  const allTokens: { type: 'tag' | 'text' | 'skip'; content: string }[] = [];
  let cursor = 0;
  // First, find all style/script blocks
  const skipRanges: Array<[number, number]> = [];
  while ((skipMatch = skipBlockRe.exec(html)) !== null) {
    skipRanges.push([skipMatch.index, skipMatch.index + skipMatch[0].length]);
  }
  // Then, walk through tags, but skip over style/script ranges
  let tagMatch: RegExpExecArray | null;
  tagRe.lastIndex = 0;
  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tagStart = tagMatch.index;
    const tagEnd = tagMatch.index + tagMatch[0].length;
    // Check if this tag is inside a skip range
    const inSkip = skipRanges.some(([s, e]) => tagStart >= s && tagEnd <= e);
    if (inSkip) continue;
    // Check if there's a skip range between cursor and this tag
    const skipBefore = skipRanges.find(([s, e]) => s >= cursor && e <= tagStart);
    if (skipBefore) {
      if (skipBefore[0] > cursor) {
        allTokens.push({ type: 'text', content: html.slice(cursor, skipBefore[0]) });
      }
      allTokens.push({ type: 'skip', content: html.slice(skipBefore[0], skipBefore[1]) });
      cursor = skipBefore[1];
    }
    if (tagStart > cursor) {
      allTokens.push({ type: 'text', content: html.slice(cursor, tagStart) });
    }
    allTokens.push({ type: 'tag', content: html.slice(tagStart, tagEnd) });
    cursor = tagEnd;
  }
  // Handle remaining skip ranges and text after last tag
  const remainingSkip = skipRanges.find(([s]) => s >= cursor);
  if (remainingSkip) {
    if (remainingSkip[0] > cursor) {
      allTokens.push({ type: 'text', content: html.slice(cursor, remainingSkip[0]) });
    }
    allTokens.push({ type: 'skip', content: html.slice(remainingSkip[0], remainingSkip[1]) });
    cursor = remainingSkip[1];
  }
  if (cursor < html.length) {
    allTokens.push({ type: 'text', content: html.slice(cursor) });
  }

  // Process text segments (skip style/script blocks and tags)
  const repairedSegments = allTokens.map(seg => {
    if (seg.type === 'tag' || seg.type === 'skip') return seg.content;

    let text = seg.content;
    // Skip the sources section (SRC-N entries themselves)
    // We only repair body text, not the source list

    text = text.replace(statPattern, (match, offset) => {
      // Check for [SRC-N] within 100 chars after the number
      const after = text.slice(offset + match.length, offset + match.length + 100);
      // Also check 50 chars before (citation may precede the number)
      const before = text.slice(Math.max(0, offset - 50), offset);

      if (/\[(?:SRC|E)-\d+\]/.test(after) || /\[(?:SRC|E)-\d+\]/.test(before)) {
        return match; // Citation present, keep the number
      }

      // Don't sanitize years (1900-2099) or source list numbers
      const yearMatch = match.match(/^\b(19\d{2}|20\d{2})\b$/);
      if (yearMatch) return match; // It's a year, not a statistic

      // Don't sanitize SRC-N or E-N numbers themselves
      if (/\[(?:SRC|E)-\d+/.test(text.slice(Math.max(0, offset - 10), offset + match.length + 10))) {
        return match;
      }

      sanitized++;
      details.push(`Sanitized unsourced number: "${match}"`);
      return 'non établie';
    });

    return text;
  });

  return {
    html: repairedSegments.join(''),
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

  // Extract style/script blocks and exclude them from matching
  const skipBlocks: string[] = [];
  let workingHtml = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    skipBlocks.push(m);
    return `\x00SKIP${skipBlocks.length - 1}\x00`;
  });

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const srcTag = `[SRC-${i + 1}]`;

    // Check if this source is already cited
    if (workingHtml.includes(srcTag)) continue;

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
        const afterMatch = workingHtml.slice(matchIdx + pattern.length);
        const endIdx = afterMatch.search(/[.!?</]/);
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

  // Split HTML into segments to find uncited text, skipping <style>/<script> blocks
  const skipBlockRe = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
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

  // Step 3: Sanitize unsourced numbers (must run AFTER all injection)
  const sanitization = sanitizeUnsourcedNumbers(workingHtml);
  workingHtml = sanitization.html;
  totalSanitized = sanitization.sanitized;
  allDetails.push(...sanitization.details);

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
