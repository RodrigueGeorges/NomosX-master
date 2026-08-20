/**
 * NomosX Hero Image Generator — generates conceptual abstract images
 * for publication heroes using GPT Image 1 (gpt-image-1).
 *
 * Design philosophy:
 * - Minimalist, dark, geometric — NomosX brand identity
 * - Conceptual: visual metaphor for the domain collision, not literal
 * - No text in images (typography is for the HTML)
 * - Consistent style across all publications
 *
 * Provider: OpenAI gpt-image-1 (uses existing OPENAI_API_KEY).
 * Fallback: deterministic SVG geometric pattern (no network needed).
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';

export interface HeroImageResult {
  url: string;
  prompt: string;
  costUsd: number;
  cached: boolean;
}

export interface HeroArticleContext {
  /** The article's through-line / consensus statement (1-2 sentences) */
  throughLine?: string;
  /** Top 3-5 key findings (specific claims with evidence) */
  keyFindings?: string[];
  /** Short summary of the analysis (1 paragraph) */
  summary?: string;
  /** Section headings from the article */
  sectionTitles?: string[];
  /** Publication format: SUMMARY_BRIEF | DECISION_MEMO | ARTICLE | STRATEGIC_REPORT */
  publicationType?: string;
}

/**
 * Generate a hero image for a publication.
 *
 * Uses OpenAI gpt-image-1 as primary provider (thematically rich images).
 * When `articleContext` is provided, an LLM first analyzes the article content
 * to produce a specific visual metaphor tailored to the actual findings —
 * not just the title. Falls back to a deterministic SVG geometric pattern on failure.
 *
 * @param title - Publication title
 * @param collision - Domain collision label (e.g., "AI Regulation × Geopolitics")
 * @param domain - Primary domain
 * @param articleContext - Optional article content for personalized imagery
 * @returns HeroImageResult or null on failure
 */
export async function generateHeroImage(
  title: string,
  collision: string,
  domain: string,
  articleContext?: HeroArticleContext,
): Promise<HeroImageResult | null> {
  const visualConcept = await deriveVisualConcept(title, collision, domain, articleContext);
  const prompt = buildImagePrompt(title, collision, domain, visualConcept, articleContext?.publicationType);

  try {
    console.log(`[HERO IMAGE] Generating for: "${title.slice(0, 60)}..."`);

    if (OPENAI_API_KEY) {
      const res = await fetch(IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'medium',
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        const url = data.data?.[0]?.url;
        // Size guard: if base64 > 2MB (~2.67M chars), use SVG fallback instead.
        // Increased from 500KB to 2MB — gpt-image-1 typically produces 1-1.5MB PNGs
        // which are acceptable for a hero image. The HTML is already 200KB+ so
        // a 1.5MB image is a reasonable proportion. Rejected 1524KB images before.
        const MAX_B64_CHARS = 2_670_000; // ~2MB decoded
        if (b64 && b64.length > MAX_B64_CHARS) {
          console.warn(`[HERO IMAGE] base64 too large (${(b64.length / 1024).toFixed(0)}KB chars) — using SVG fallback`);
        } else if (b64) {
          const imageUrl = `data:image/png;base64,${b64}`;
          console.log(`[HERO IMAGE] ✅ Generated via gpt-image-1 (${(b64.length / 1024).toFixed(0)}KB, cost ~$0.02)`);
          return { url: imageUrl, prompt, costUsd: 0.02, cached: false };
        } else if (url) {
          console.log(`[HERO IMAGE] ✅ Generated via gpt-image-1 (URL, cost ~$0.02)`);
          return { url, prompt, costUsd: 0.02, cached: false };
        }
      } else {
        const err = await res.text().catch(() => '');
        console.warn(`[HERO IMAGE] gpt-image-1 error ${res.status}: ${err.slice(0, 200)}`);
      }
    } else {
      console.warn('[HERO IMAGE] No OPENAI_API_KEY — skipping gpt-image-1');
    }

    // Fallback: deterministic SVG geometric pattern (no network needed)
    console.log('[HERO IMAGE] Falling back to SVG geometric pattern');
    const svgDataUrl = generateGeometricSVG(title, domain);
    return {
      url: svgDataUrl,
      prompt: 'geometric SVG fallback',
      costUsd: 0,
      cached: false,
    };
  } catch (err: any) {
    console.warn(`[HERO IMAGE] gpt-image-1 failed: ${err.message}, using SVG fallback`);
    const svgDataUrl = generateGeometricSVG(title, domain);
    return {
      url: svgDataUrl,
      prompt: 'geometric SVG fallback',
      costUsd: 0,
      cached: false,
    };
  }
}

/**
 * Deterministic seed from title for reproducible images.
 */
function deterministicSeed(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 1000000;
}

/**
 * Use an LLM to derive a SUBJECT-SPECIFIC visual motif for the hero image.
 *
 * Two-stage process (based on editorial illustration research, March 2026):
 *   Stage 1: Extract the article's core tension (one sentence)
 *   Stage 2: Translate that tension into a concrete physical motif that passes
 *            the "METAPHOR TEST": if you describe the image to someone who
 *            hasn't read the article, can they guess the topic? If not, the
 *            motif is too abstract and must be rejected.
 *
 * The base art direction (dark, cinematic, monochrome, Villeneuve-style) is
 * fixed and never touched. The motif is grafted onto the existing scene.
 *
 * Returns a structured object with the motif description, or null on failure.
 * Cost: ~$0.0005 (one cheap LLM call, cacheable).
 */
async function deriveVisualConcept(
  title: string,
  collision: string,
  domain: string,
  ctx?: HeroArticleContext,
): Promise<string | null> {
  // If no article context, skip personalization
  if (!ctx || (!ctx.throughLine && !ctx.keyFindings?.length && !ctx.summary)) {
    return null;
  }

  try {
    const findingsBlock = (ctx.keyFindings || []).slice(0, 5)
      .map((f, i) => `  ${i + 1}. ${f.slice(0, 200)}`)
      .join('\n');
    const sectionsBlock = (ctx.sectionTitles || []).slice(0, 8)
      .map(s => `  - ${s}`)
      .join('\n');

    const userContent = `You are a visual art director for a high-end think tank (NomosX). The art direction is FIXED: dark, cinematic, monochrome, Denis Villeneuve-style architectural scenes with volumetric lighting. You never change the art direction — your job is to identify the MOTIF (the central physical element) that goes inside the scene.

## ARTICLE CONTEXT

TITLE: ${title}
DOMAIN COLLISION: ${collision}
PRIMARY DOMAIN: ${domain}

THROUGH-LINE (core argument):
${ctx.throughLine || '(not provided)'}

KEY FINDINGS (evidence-backed claims):
${findingsBlock || '(not provided)'}

SUMMARY:
${(ctx.summary || '(not provided)').slice(0, 600)}

SECTION TITLES:
${sectionsBlock || '(not provided)'}

## YOUR TASK

Work through these steps mentally before writing your answer:

STEP 1 — CORE TENSION: What is the single most important tension, contradiction, or mechanism in this article? Express it in one sentence.

STEP 2 — PHYSICAL TRANSLATION: What physical object, architectural element, or sculptural form embodies that tension? The form must be:
- A PHYSICAL OBJECT or ARCHITECTURAL ELEMENT (not a concept, not a symbol, not an analogy)
- Something that VISUALLY COMMUNICATES the tension when you look at it — no caption needed
- Specific enough that a reader who sees the image would think "yes, that's exactly what this article is about"

STEP 3 — THE METAPHOR TEST (critical): Imagine showing the image to someone who has NOT read the article. Ask them: "What do you think this article is about?" If they can guess the general topic or tension, the motif PASSES. If they say "I have no idea" or guess something completely unrelated, the motif FAILS — try again with a more visually obvious form.

## EXAMPLES

PASS the metaphor test:
- Article: "explanation instability under perturbation"
  Tension: explanations change when inputs are slightly perturbed, even though the model's prediction doesn't change
  Motif: "a vast mirror wall in a dark hall, half its panels shattered and misaligned, each reflecting a different distorted version of the same single light source — the wall looks intact from afar but is fractured up close"
  Why it passes: anyone seeing shattered, misaligned mirrors reflecting different versions of the same light would think "instability, distortion, things that look fine but aren't"

- Article: "institutional collapse"
  Tension: a seemingly stable institution is mid-collapse, the failure point is visible
  Motif: "a monumental stone archway mid-collapse, one keystone slipping out of place, dust and debris suspended in a single shaft of light"
  Why it passes: anyone seeing a collapsing archway would think "collapse, structural failure"

- Article: "competing regulatory regimes"
  Tension: two systems pressing against each other, neither dominant, stress at the boundary
  Motif: "two vast geometric monoliths leaning against each other in frozen tension, a visible crack running between them where they meet"
  Why it passes: two massive structures pressing against each other with a crack = "conflict, competition, stress"

FAIL the metaphor test:
- A sundial for "explanation instability" → FAIL: a sundial doesn't visually suggest instability. A reader would think "time" or "ancient instrument", not "fragile explanations"
- A clock for "time pressure" → FAIL: too generic, too literal. Every article about deadlines would use a clock
- A brain for "AI" → FAIL: cliché. Every AI article uses brains. No specificity
- A balance scale for "trade-offs" → FAIL: overused, boring, no visual specificity

## RULES

1. The motif must be a PHYSICAL OBJECT or ARCHITECTURAL ELEMENT — not a concept, not a symbol, not an analogy
2. The visual itself must communicate the tension — no intellectual leap, no caption needed
3. It must pass the METAPHOR TEST (step 3 above)
4. It must be specific to THIS article's actual findings — not a generic symbol
5. It must fit naturally in a dark, cinematic, monochrome scene
6. NO: human figures, text, UI elements, diagrams, clocks, sundials, brains, balance scales, globes, lightbulbs, gears, circuit boards, DNA helices, network graphs
7. Describe the motif in 2-3 sentences. Include its physical state (intact? fractured? collapsing? frozen?) and how light interacts with it.

Respond with ONLY the motif description. No preamble, no explanation, no step labels, no markdown.`;

    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are a visual art director who specializes in editorial cover illustrations. You output only concrete physical motif descriptions that pass the metaphor test. No commentary, no explanation.' },
        { role: 'user', content: userContent },
      ],
      task: 'reader_v3' as any, // cheap task, cacheable
      maxTokens: 120,
      temperature: 0.7,
      enableCache: true,
    });

    let concept = (res.content || '').trim();
    // Strip any reasoning prefix — LLM sometimes ignores "ONLY the motif"
    // and outputs "STEP 1: ... STEP 2: ... Motif: ..."
    const motifMatch = concept.match(/(?:motif|MOTIF|answer|ANSWER)\s*[:\-]\s*["']?([\s\S]+)/i);
    if (motifMatch && motifMatch[1].length > 20) {
      concept = motifMatch[1].trim();
    }
    // If still too long, take last 2 sentences (the motif usually comes last)
    if (concept.length > 400) {
      const sentences = concept.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      const lastSentences = sentences.slice(-3).join('. ').trim();
      if (lastSentences.length > 20 && lastSentences.length < concept.length) {
        concept = lastSentences;
      }
    }
    if (concept.length < 20 || concept.length > 600) {
      console.warn(`[HERO IMAGE] LLM motif length ${concept.length} — rejecting (too ${concept.length < 20 ? 'short' : 'long'})`);
      return null;
    }
    console.log(`[HERO IMAGE] LLM motif derived (${concept.length} chars): ${concept.slice(0, 100)}...`);
    return concept;
  } catch (err: any) {
    console.warn(`[HERO IMAGE] LLM motif derivation failed: ${err.message?.slice(0, 100)} — using generic prompt`);
    return null;
  }
}

/**
 * Map publication format → composition directives.
 * Different formats warrant different visual weight and complexity:
 *  - Signal Brief (500-1200w): minimal, one striking focal element, urgency
 *  - Decision Memo (1200-2500w): structured, clear geometry, a threshold or choice
 *  - Article (3000-6000w): layered, narrative depth, multiple elements in tension
 *  - Strategic Report (8000-20000w): monumental, complex, multi-layered, vast scale
 */
function formatCompositionDirectives(publicationType?: string): string {
  switch (publicationType) {
    case 'SUMMARY_BRIEF':
      return `COMPOSITION (Signal Brief — short alert format):
- Minimalist: a SINGLE striking focal element dominating the frame
- Tight, focused composition with strong negative space around the motif
- Sense of urgency or alert — a sharp edge, a sudden fracture, a single point of light breaking through
- No clutter — the eye goes immediately to the one element that matters`;
    case 'DECISION_MEMO':
      return `COMPOSITION (Decision Memo — structured decision format):
- Clear, structured geometry — two or three distinct forms in deliberate arrangement
- A sense of threshold or choice: a doorway, a fork, a pivot point, a balance
- The composition should feel like a decision about to be made — tension held in balance
- Architectural clarity, not ambiguity`;
    case 'STRATEGIC_REPORT':
      return `COMPOSITION (Strategic Report — comprehensive strategic format):
- Monumental scale: a vast, complex architectural space with multiple layers and depth
- Sense of comprehensive scope — multiple structures, terraces, or levels visible
- The motif is embedded within a larger system, not isolated
- Epic, sweeping composition with deep perspective and layered depth`;
    case 'ARTICLE':
    default:
      return `COMPOSITION (Article — long-form analytical format):
- Layered composition with narrative depth — two or three elements in tension or dialogue
- Balanced but not symmetrical — the eye moves through the scene discovering detail
- The motif is the anchor but the surrounding space tells part of the story too
- Cinematic mid-shot framing with intentional negative space`;
  }
}

/**
 * Build a premium, cinematic image prompt using the six-block structure
 * recommended by OpenAI's gpt-image prompting guide and editorial
 * illustration research (March 2026).
 *
 * Structure (token order matters — left-to-right decay means earlier
 * tokens carry more weight):
 *   1. SCENE/BACKGROUND — the environment, atmosphere, spatial context
 *   2. SUBJECT — the central motif (from LLM derivation or generic fallback)
 *   3. COMPOSITION — framing, viewpoint, focal placement, negative space
 *   4. LIGHTING & COLOR — light source, palette, contrast, mood
 *   5. VISUAL TREATMENT — medium, style references, texture, quality cues
 *   6. CONSTRAINTS — what to avoid, output format, invariants
 */
function buildImagePrompt(
  title: string,
  collision: string,
  domain: string,
  visualConcept?: string | null,
  publicationType?: string,
): string {
  const domains = collision.split('×').map(d => d.trim().toLowerCase());

  const domainContext: Record<string, string> = {
    'ai-technology': 'artificial intelligence, machine learning, neural architectures, algorithmic systems',
    'ai-policy': 'AI regulation, governance frameworks, compliance thresholds, algorithmic accountability',
    'ai-safety': 'AI safety, alignment, containment, risk barriers',
    'economics': 'economic dynamics, market structures, capital flows, firm behavior, industrial organization',
    'finance-macro': 'monetary policy, financial systems, banking architecture, macroeconomic stability',
    'geopolitics': 'geopolitical strategy, territorial dynamics, power projection, international order',
    'climate': 'climate systems, environmental thresholds, atmospheric dynamics, ecological feedback',
    'health-biotech': 'biomedical innovation, molecular structures, health systems, therapeutic pathways',
    'biotechnology': 'genetic engineering, cellular mechanics, bioinformatics, synthetic biology',
    'cybersecurity': 'digital security, threat vectors, encrypted infrastructure, attack surfaces',
    'energy': 'energy systems, power grids, resource extraction, transition dynamics',
    'trade': 'trade networks, supply chains, commercial routes, tariff structures',
    'eu-policy': 'European regulation, institutional frameworks, legislative architecture',
    'digital-governance': 'digital rights, data governance, platform regulation, online accountability',
    'emerging-markets': 'emerging economies, development trajectories, growth dynamics',
    'social-stability': 'social cohesion, demographic shifts, civic dynamics, public order',
    'science-frontier': 'scientific frontiers, experimental discovery, knowledge boundaries',
    'security': 'defense strategy, security architectures, threat assessment',
    'development': 'development economics, infrastructure growth, institutional capacity',
    'labor': 'labor markets, workforce dynamics, employment structures, automation impact',
  };

  const contextTerms = domains
    .map(d => domainContext[d] || '')
    .filter(Boolean)
    .join(', ');

  const subjectBlock = visualConcept
    ? `SUBJECT — the central motif, derived from the article's actual findings:
${visualConcept}

This motif is the FOCAL POINT of the image. It sits at the center of the scene, monumental and sculptural. The reader should be able to look at this image and immediately sense what the article is about — the motif communicates the tension visually, without any caption.`
    : `SUBJECT — derive a visual metaphor from the article title:
"${title}"
Translate the core tension in the title into a specific, dramatic physical form:
- "Threshold" or "discontinuity" → a vast dark architectural space with a dramatic gateway or barrier, light streaming through a narrow opening creating a sharp divide
- "Convergence" of domains → two massive structural forms merging or colliding in a dark void
- "Vacuum" or "gap" → a void or absence within an otherwise dense, monumental structure
- "Cost" or "impact" → force or pressure visibly acting on architectural or sculptural forms
- "Ceiling" or "limit" → a vast overhead structure pressing down on forms below
The motif must feel commissioned specifically for THIS article — not a stock illustration.`;

  const compositionBlock = formatCompositionDirectives(publicationType);

  return `Create a premium editorial cover image for a high-end think tank report. This is a hero image that will appear at the top of the article — it must communicate the article's core tension in a single glance.

ARTICLE: "${title}"
DOMAINS: ${contextTerms || 'strategic analysis and policy'}

1. SCENE & BACKGROUND
A vast, dark architectural space — monumental in scale, like the interior of a brutalist cathedral or an underground cavern hewn from black stone. Deep black background with subtle volumetric depth. The space feels physical, real, load-bearing — not a void, not a gradient, not a studio backdrop. Atmospheric particles suspended in the air catch the light.

2. ${subjectBlock}

3. ${compositionBlock}

4. LIGHTING & COLOR
- Single shaft of volumetric light from one direction, cutting through the darkness
- Light catches atmospheric particles, creating visible god-rays
- The motif is lit by this shaft — half in light, half in shadow
- Monochrome palette: charcoal blacks (#0a0a0a), deep greys (#1a1a1a), soft silver-whites (#e0e0e8)
- No saturated colors. No warm tones. No neon. No gradients. Pure monochrome with subtle silver luminance.
- High contrast between the lit motif and the surrounding darkness

5. VISUAL TREATMENT
- Photorealistic 3D render quality — like a matte painting for a Denis Villeneuve film (Dune, Blade Runner 2049)
- Style references: The Atlantic editorial illustrations, Wired cover art, Apple keynote backdrops
- Subtle depth of field — the motif is sharp, the far background slightly soft
- Tactile textures: cold stone, polished metal, rough concrete, reflective glass
- Uniform rendering quality — no flat 2D elements mixed with 3D
- Cinematic, premium, authoritative. This is not stock art — it is commissioned editorial illustration.

6. CONSTRAINTS — DO NOT INCLUDE
- No text, no letters, no numbers, no words anywhere in the image
- No human figures, no faces, no silhouettes of people
- No logos, no UI elements, no diagrams, no charts, no infographics
- No clocks, no sundials, no brains, no lightbulbs, no gears, no circuit boards
- No DNA helices, no network graphs, no globe, no maps
- No saturated colors, no neon, no warm tones
- No collage, no split-screen, no multi-panel layout
- No stock photo clichés, no generic "AI" or "technology" imagery
- Output: single cohesive image, 16:9 widescreen, cinematic composition`;
}

/**
 * Generate a deterministic SVG geometric pattern as fallback.
 * Matches NomosX brand identity: black background, white/grey geometric lines.
 * No network required — always works.
 */
function generateGeometricSVG(title: string, domain: string): string {
  const seed = deterministicSeed(title);
  const rng = mulberry32(seed);

  const W = 1536, H = 1024;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#000000"/>`;

  // Domain-specific geometric patterns
  const isAI = domain.includes('ai') || domain.includes('tech') || domain.includes('digital');
  const isEcon = domain.includes('econ') || domain.includes('finance') || domain.includes('trade');
  const isPolicy = domain.includes('policy') || domain.includes('governance') || domain.includes('regul');
  const isGeopol = domain.includes('geo') || domain.includes('security') || domain.includes('defense');

  // Grid lines (architectural blueprint feel)
  const gridSpacing = 64;
  for (let x = 0; x <= W; x += gridSpacing) {
    const opacity = 0.03 + rng() * 0.04;
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(240,240,250,${opacity.toFixed(3)})" stroke-width="0.5"/>`;
  }
  for (let y = 0; y <= H; y += gridSpacing) {
    const opacity = 0.03 + rng() * 0.04;
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(240,240,250,${opacity.toFixed(3)})" stroke-width="0.5"/>`;
  }

  // Domain-specific overlay
  if (isAI) {
    // Neural network nodes + connections
    const nodes: Array<[number, number]> = [];
    for (let i = 0; i < 24; i++) {
      nodes.push([100 + rng() * (W - 200), 100 + rng() * (H - 200)]);
    }
    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
        if (dist < 250) {
          const op = (1 - dist / 250) * 0.12;
          svg += `<line x1="${nodes[i][0].toFixed(0)}" y1="${nodes[i][1].toFixed(0)}" x2="${nodes[j][0].toFixed(0)}" y2="${nodes[j][1].toFixed(0)}" stroke="rgba(240,240,250,${op.toFixed(3)})" stroke-width="0.6"/>`;
        }
      }
    }
    // Draw nodes
    for (const [nx, ny] of nodes) {
      const r = 2 + rng() * 3;
      svg += `<circle cx="${nx.toFixed(0)}" cy="${ny.toFixed(0)}" r="${r.toFixed(1)}" fill="rgba(240,240,250,${(0.15 + rng() * 0.25).toFixed(3)})"/>`;
    }
  } else if (isEcon) {
    // Supply/demand curves + market flows
    for (let i = 0; i < 5; i++) {
      const yBase = 200 + i * 150;
      let path = `M 0 ${yBase}`;
      for (let x = 0; x <= W; x += 20) {
        const y = yBase + Math.sin((x + seed) * 0.008 + i) * 60 + rng() * 20;
        path += ` L ${x} ${y.toFixed(0)}`;
      }
      svg += `<path d="${path}" stroke="rgba(240,240,250,${(0.06 + i * 0.02).toFixed(3)})" stroke-width="0.8" fill="none"/>`;
    }
  } else if (isPolicy || isGeopol) {
    // Institutional frameworks — concentric rectangles + connecting lines
    for (let i = 0; i < 6; i++) {
      const cx = W / 2 + (rng() - 0.5) * 400;
      const cy = H / 2 + (rng() - 0.5) * 300;
      const w = 200 + rng() * 300;
      const h = 150 + rng() * 200;
      svg += `<rect x="${(cx - w/2).toFixed(0)}" y="${(cy - h/2).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" stroke="rgba(240,240,250,${(0.05 + rng() * 0.08).toFixed(3)})" stroke-width="0.7" fill="none"/>`;
    }
    // Connecting lines between frameworks
    for (let i = 0; i < 8; i++) {
      const x1 = rng() * W, y1 = rng() * H;
      const x2 = x1 + (rng() - 0.5) * 400;
      const y2 = y1 + (rng() - 0.5) * 300;
      svg += `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="rgba(240,240,250,${(0.04 + rng() * 0.06).toFixed(3)})" stroke-width="0.5" stroke-dasharray="4 8"/>`;
    }
  } else {
    // Default: abstract geometric shapes
    for (let i = 0; i < 40; i++) {
      const x = rng() * W, y = rng() * H;
      const r = 20 + rng() * 80;
      const op = 0.03 + rng() * 0.08;
      svg += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" stroke="rgba(240,240,250,${op.toFixed(3)})" stroke-width="0.5" fill="none"/>`;
    }
  }

  // Diagonal accent lines (cinematic feel)
  for (let i = 0; i < 3; i++) {
    const y = 200 + i * 300;
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y - 100}" stroke="rgba(240,240,250,${(0.04 + i * 0.02).toFixed(3)})" stroke-width="0.4"/>`;
  }

  // Bottom gradient fade
  svg += `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000000" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.6"/></linearGradient></defs>`;
  svg += `<rect width="${W}" height="${H}" fill="url(#fade)"/>`;

  svg += `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** Simple deterministic PRNG (mulberry32) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Persist hero image URL to the publication record.
 */
export async function saveHeroImage(
  publicationId: string,
  imageUrl: string,
): Promise<void> {
  try {
    await prisma.thinkTankPublication.update({
      where: { id: publicationId },
      data: { heroImageUrl: imageUrl },
    });
  } catch (err) {
    console.warn(`[HERO IMAGE] Failed to save URL: ${err}`);
  }
}
