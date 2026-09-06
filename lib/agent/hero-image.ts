/**
 * NomosX Hero Image Generator — generates symbolic illustrations
 * for publication heroes using GPT Image 1 (gpt-image-1).
 *
 * Design philosophy — "From Chaos to Nomos":
 * - A single sculptural form emerging from darkness — the nomos
 * - The surrounding void IS the chaos — felt, not shown literally
 * - Light reveals the form; shadow preserves the chaos it emerged from
 * - The motif is specific to the article's tension, not a generic symbol
 * - Subtle, never didactic — the viewer feels the ordering, doesn't see a diagram
 * - Minimalist, dark, monochrome — Villeneuve cinematic aesthetic
 * - No text in images (typography is for the HTML)
 * - Consistent style across all publications
 *
 * Provider: OpenAI gpt-image-1 (uses existing OPENAI_API_KEY).
 * Fallback: deterministic SVG (no network needed).
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { httpPost } from '../http-client';

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
      const data: any = await httpPost(IMAGE_ENDPOINT, {
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }, {
        timeout: 180000,
        retries: 1,
        rateLimiterKey: 'openai-image',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }).catch((err: any) => {
        console.warn(`[HERO IMAGE] gpt-image-1 error: ${err.message?.slice(0, 200)}`);
        return null;
      });

      if (data) {
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

    const userContent = `You are the visual art director for NomosX — the first AI think tank. Our DNA is "From Chaos to Nomos": we transform the chaos of fragmented information into ordered, source-verified positions.

## THE NOMOSX VISUAL IDENTITY

The art direction is FIXED and you never change it:
- Dark, cinematic, monochrome — black stone, charcoal, silver luminance
- Denis Villeneuve aesthetic (Dune, Blade Runner 2049): monumental, tactile, atmospheric
- A single shaft of volumetric light cutting through darkness
- No saturated colors, no warm tones, no neon

The MOTIF — the central physical element — must embody our DNA through SUBTLETY, not literalness:
- A single sculptural form, monumental, emerging from darkness
- The surrounding void IS the chaos — felt, not shown literally
- The form itself is the "nomos" — ordered, precise, intentional
- Light reveals the form; shadow preserves the chaos it emerged from
- NEVER split the image into "chaos side" and "order side" — that is didactic and cringe
- The ordering is IMPLIED by the precision of the form against the void around it

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

STEP 2 — SCULPTURAL FORM: What single physical form embodies this tension? The form must be:
- A SINGLE sculptural or architectural element — not a scene with multiple parts
- Monumental in scale — something that feels load-bearing, structural, permanent
- Physically specific — not "abstract shapes" or "geometric forms"
- The form itself should carry the tension IN ITS PHYSICAL STATE (intact? fractured? mid-formation? compressed? suspended? leaning?)

STEP 3 — THE METAPHOR TEST: Imagine showing the image to someone who has NOT read the article. Ask them: "What do you think this article is about?" If they can sense the general tension, the motif PASSES. If they say "I have no idea" or "it's just abstract art," the motif FAILS.

STEP 4 — SUBTLETY CHECK: Is this didactic? Does it look like a diagram or infographic? Does it literally illustrate the concept (e.g., "fragments becoming a grid" for fragmentation)? If yes, REJECT IT. The best editorial illustrations embody the tension through a single object's physical state — the viewer FEELS the meaning, they don't decode it.

## EXAMPLES

PASS — subtle, sculptural, specific:
- Article: "institutional collapse"
  Tension: a seemingly stable institution is mid-collapse, the failure point is visible
  Motif: "a monumental stone archway, intact from a distance but with a single keystone visibly slipping — dust suspended in the shaft of light catching it. The arch is perfect except for this one displacement. The viewer feels: something is failing, quietly, right now."
  Why it passes: a single form, the tension is in its physical state (the slipping keystone), not a diagram

- Article: "competing regulatory regimes"
  Tension: two systems pressing against each other, stress at the boundary
  Motif: "two vast geometric monoliths leaning against each other in frozen tension, a hairline crack visible where they meet. The forms are otherwise flawless. The crack catches the light."
  Why it passes: the tension is in the relationship between two forms, not in a "before/after" split

- Article: "AI explanation instability"
  Tension: explanations shift subtly when inputs change slightly
  Motif: "a vast mirror wall, seemingly intact, but at its center the reflections are subtly misaligned — panels shifted by millimeters, each reflecting a slightly different version of the same light source. The wall looks perfect until you look closely."
  Why it passes: a single form, the tension is in a subtle physical detail, not a literal illustration

FAIL — too literal, didactic, cringe:
- "Fragments on the left converging into a grid on the right" → FAIL: this is a diagram, not an illustration. It literally draws the concept. Cringe.
- "A clock for time pressure" → FAIL: cliché, no subtlety
- "A brain for AI" → FAIL: cliché
- "Chaos on one side, order on the other" → FAIL: didactic split-screen. The viewer decodes it instead of feeling it.

## RULES

1. ONE sculptural form — not a scene with multiple competing elements
2. The tension lives IN the form's physical state — not in a layout or arrangement
3. SUBTLE — the viewer feels the meaning, doesn't decode a diagram
4. Specific to THIS article — not a generic symbol
5. Monumental, tactile, cinematic — it feels physical, load-bearing
6. NO: human figures, text, UI, diagrams, clocks, brains, lightbulbs, gears, circuit boards, DNA, globes, maps, network graphs, balance scales
7. NO: split-screen, before/after, chaos-on-one-side/order-on-the-other — that is didactic
8. Describe the form in 2-3 sentences. Include its physical state and how light interacts with it.

Respond with ONLY the motif description. No preamble, no explanation, no step labels, no markdown.`;

    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are the visual art director for NomosX, the first AI think tank. You specialize in editorial cover illustrations that embody the movement "From Chaos to Nomos" — disorder transforming into order. You output only concrete physical motif descriptions that pass the metaphor test and show the chaos→order transition. No commentary, no explanation.' },
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
    ? `SUBJECT — the central sculptural form, derived from the article's actual findings:
${visualConcept}

This form is the FOCAL POINT of the image — a single monumental element emerging from darkness. The surrounding void is the chaos; the form is the nomos. Light reveals the form's surface and physical state. The viewer should FEEL the article's tension by looking at the form — not decode a diagram.`
    : `SUBJECT — derive a sculptural form from the article title:
"${title}"
A single monumental form that embodies the article's tension through its physical state:
- "Threshold" → a vast stone aperture, one edge fractured, light cutting through the opening
- "Convergence" → two geometric forms leaning together, a hairline crack at the junction
- "Collapse" → a monumental arch with a single keystone visibly slipping
- "Pressure" → a form compressed or bent under invisible force, material stress visible
- "Void" → a dense structure with a precise absence at its center — the void is the subject
The form must feel commissioned for THIS article — not a stock illustration.`;

  const compositionBlock = formatCompositionDirectives(publicationType);

  return `Create a premium editorial cover image for NomosX — the first AI think tank. Our DNA is "From Chaos to Nomos": we transform fragmented information into ordered, defensible positions. This hero image must embody that act through a single sculptural form emerging from darkness.

ARTICLE: "${title}"
DOMAINS: ${contextTerms || 'strategic analysis and policy'}

1. SCENE & BACKGROUND
A vast, dark space — monumental in scale, like the interior of a brutalist cathedral or a cavern hewn from black stone. Deep black background with subtle volumetric depth. The space feels physical, real, load-bearing. Atmospheric particles suspended in the air catch the light. The darkness around the form is the chaos — felt, not shown literally. No split-screen, no "before/after" layout.

2. ${subjectBlock}

3. ${compositionBlock}

4. LIGHTING & COLOR
- Single shaft of volumetric light from one direction, cutting through the darkness
- Light catches atmospheric particles, creating subtle god-rays
- The form is lit by this shaft — revealing its surface, its texture, its physical state
- The unlit portions of the form remain in deep shadow — the chaos it emerged from
- Monochrome palette: charcoal blacks (#0a0a0a), deep greys (#1a1a1a), soft silver-whites (#e0e0e8)
- No saturated colors. No warm tones. No neon. No gradients. Pure monochrome with subtle silver luminance.
- High contrast between the lit form and the surrounding darkness

5. VISUAL TREATMENT
- Photorealistic 3D render quality — like a matte painting for a Denis Villeneuve film (Dune, Blade Runner 2049)
- Style references: The Atlantic editorial illustrations, Wired cover art, Apple keynote backdrops
- Subtle depth of field — the form is sharp, the far background slightly soft
- Tactile textures: cold stone, polished metal, rough concrete, reflective glass
- Uniform rendering quality — no flat 2D elements mixed with 3D
- Cinematic, premium, authoritative. Subtle, not didactic. The viewer feels the meaning — they don't decode a diagram.

6. CONSTRAINTS — DO NOT INCLUDE
- No text, no letters, no numbers, no words anywhere in the image
- No human figures, no faces, no silhouettes of people
- No logos, no UI elements, no diagrams, no charts, no infographics
- No clocks, no sundials, no brains, no lightbulbs, no gears, no circuit boards
- No DNA helices, no network graphs, no globe, no maps
- No saturated colors, no neon, no warm tones
- No collage, no split-screen, no multi-panel layout, no "before/after" arrangement
- No literal illustrations of concepts (e.g., no "fragments becoming a grid" to show fragmentation)
- No stock photo clichés, no generic "AI" or "technology" imagery
- Output: single cohesive image, 16:9 widescreen, cinematic composition`;
}

/**
 * Generate a deterministic SVG illustration as fallback.
 * A single geometric form — a partial arch or monolith — emerging from
 * darkness, lit by a single shaft of light. Subtle, sculptural, not didactic.
 * No network required — always works.
 */
function generateGeometricSVG(title: string, domain: string): string {
  const seed = deterministicSeed(title);
  const rng = mulberry32(seed);

  const W = 1536, H = 1024;
  const cx = W * 0.5;
  const cy = H * 0.52;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#000000"/>`;

  // ── Subtle background texture: faint atmospheric particles ──
  for (let i = 0; i < 60; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 0.5 + rng() * 1.2;
    const op = 0.02 + rng() * 0.04;
    svg += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="rgba(240,240,250,${op.toFixed(3)})"/>`;
  }

  // ── The form: a partial arch or monolithic structure ──
  // Determined by seed — some titles get an arch, others a monolith, others a column
  const formType = seed % 3;

  // Light comes from upper-right
  const lightAngle = -25 * Math.PI / 180;

  if (formType === 0) {
    // ── ARCH: a monumental stone arch, one edge slightly fractured ──
    const archW = 500;
    const archH = 600;
    const archRadius = archW / 2;
    const archX = cx - archW / 2;
    const archY = cy - archH / 2;
    const archThickness = 60;

    // Outer arch curve
    const outerR = archRadius;
    const innerR = archRadius - archThickness;
    // Left pillar
    svg += `<rect x="${archX.toFixed(0)}" y="${(archY + archRadius).toFixed(0)}" width="${archThickness}" height="${(archH - archRadius).toFixed(0)}" fill="rgba(240,240,250,0.04)" stroke="rgba(240,240,250,0.10)" stroke-width="1"/>`;
    // Right pillar
    svg += `<rect x="${(archX + archW - archThickness).toFixed(0)}" y="${(archY + archRadius).toFixed(0)}" width="${archThickness}" height="${(archH - archRadius).toFixed(0)}" fill="rgba(240,240,250,0.06)" stroke="rgba(240,240,250,0.14)" stroke-width="1"/>`;
    // Arch curve (top)
    svg += `<path d="M ${archX} ${(archY + archRadius).toFixed(0)} A ${outerR} ${outerR} 0 0 1 ${(archX + archW).toFixed(0)} ${(archY + archRadius).toFixed(0)} L ${(archX + archW - archThickness).toFixed(0)} ${(archY + archRadius).toFixed(0)} A ${innerR} ${innerR} 0 0 0 ${(archX + archThickness).toFixed(0)} ${(archY + archRadius).toFixed(0)} Z" fill="rgba(240,240,250,0.05)" stroke="rgba(240,240,250,0.12)" stroke-width="1"/>`;
    // Subtle fracture on the left pillar (a hairline crack)
    const crackY = archY + archRadius + 100 + rng() * 200;
    svg += `<line x1="${(archX + archThickness * 0.5).toFixed(0)}" y1="${crackY.toFixed(0)}" x2="${(archX + archThickness * 0.3).toFixed(0)}" y2="${(crackY + 40).toFixed(0)}" stroke="rgba(240,240,250,0.08)" stroke-width="0.6"/>`;
  } else if (formType === 1) {
    // ── MONOLITH: a single tall rectangular form, slightly leaning ──
    const monW = 280;
    const monH = 700;
    const lean = 3; // slight lean in degrees
    const monX = cx - monW / 2;
    const monY = cy - monH / 2;
    const transform = `rotate(${lean} ${cx} ${cy})`;
    svg += `<rect x="${monX.toFixed(0)}" y="${monY.toFixed(0)}" width="${monW}" height="${monH}" transform="${transform}" fill="rgba(240,240,250,0.05)" stroke="rgba(240,240,250,0.12)" stroke-width="1" rx="2"/>`;
    // Subtle surface lines (material texture)
    for (let i = 0; i < 5; i++) {
      const ly = monY + 100 + i * 120 + rng() * 40;
      svg += `<line x1="${(monX + 20).toFixed(0)}" y1="${ly.toFixed(0)}" x2="${(monX + monW - 20).toFixed(0)}" y2="${(ly + (rng() - 0.5) * 10).toFixed(0)}" transform="${transform}" stroke="rgba(240,240,250,0.04)" stroke-width="0.4"/>`;
    }
  } else {
    // ── APERTURE: a rectangular frame with light cutting through the opening ──
    const apW = 400;
    const apH = 560;
    const apX = cx - apW / 2;
    const apY = cy - apH / 2;
    const frameThickness = 50;
    // Frame
    svg += `<rect x="${apX.toFixed(0)}" y="${apY.toFixed(0)}" width="${apW}" height="${apH}" fill="none" stroke="rgba(240,240,250,0.10)" stroke-width="${frameThickness}" stroke-linejoin="miter"/>`;
    // Inner opening — slightly lighter (light coming through)
    svg += `<rect x="${(apX + frameThickness / 2).toFixed(0)}" y="${(apY + frameThickness / 2).toFixed(0)}" width="${(apW - frameThickness).toFixed(0)}" height="${(apH - frameThickness).toFixed(0)}" fill="rgba(240,240,250,0.015)"/>`;
    // One edge of the frame slightly fractured
    const fracY = apY + 80 + rng() * 200;
    svg += `<line x1="${apX.toFixed(0)}" y1="${fracY.toFixed(0)}" x2="${(apX - 8).toFixed(0)}" y2="${(fracY + 25).toFixed(0)}" stroke="rgba(240,240,250,0.06)" stroke-width="0.5"/>`;
  }

  // ── Light shaft: subtle diagonal volumetric light from upper-right ──
  svg += `<defs>`;
  svg += `<linearGradient id="lightShaft" x1="0.75" y1="0" x2="0.25" y2="1" gradientUnits="objectBoundingBox">`;
  svg += `<stop offset="0%" stop-color="rgba(240,240,250,0.06)"/>`;
  svg += `<stop offset="50%" stop-color="rgba(240,240,250,0.02)"/>`;
  svg += `<stop offset="100%" stop-color="rgba(240,240,250,0)"/>`;
  svg += `</linearGradient>`;
  svg += `<radialGradient id="formGlow" cx="0.65" cy="0.35" r="0.5" gradientUnits="objectBoundingBox">`;
  svg += `<stop offset="0%" stop-color="rgba(240,240,250,0.04)"/>`;
  svg += `<stop offset="100%" stop-color="rgba(240,240,250,0)"/>`;
  svg += `</radialGradient>`;
  svg += `</defs>`;
  // Light shaft as a subtle polygon
  const shaftW = 600;
  svg += `<polygon points="${W},${0} ${W},${H} ${(W - shaftW).toFixed(0)},${H} ${(W - shaftW - 200).toFixed(0)},${0}" fill="url(#lightShaft)" opacity="0.7"/>`;
  // Glow on the form
  svg += `<rect width="${W}" height="${H}" fill="url(#formGlow)"/>`;

  // ── Bottom gradient fade (cinematic) ──
  svg += `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000000" stop-opacity="0"/><stop offset="70%" stop-color="#000000" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.4"/></linearGradient></defs>`;
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
