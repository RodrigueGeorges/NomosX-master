/**
 * NomosX Hero Image Generator — generates symbolic illustrations
 * for publication heroes using GPT Image 2.
 *
 * Design philosophy — "From Chaos to Nomos", expressed as GREEK FRESCO × AI:
 * - Each publication gets a mythic figure or tableau — gods, draped beings,
 *   mythological scenes — rendered like a rediscovered ancient fresco:
 *   mineral pigments, weathered plaster, visible craquelure
 * - The ancient scene is fused with machine intelligence: fine luminous
 *   filaments woven into drapery, glowing seams, faint geometric overlays
 * - The fresco pigment palette carries real color — lapis blue, terracotta,
 *   cinnabar, verdigris, gold leaf — emerging from a deep obsidian ground
 * - The myth is chosen for the article's actual tension (Icarus for overreach,
 *   Atlas for structural burden, the Labyrinth for complexity, the Oracle for
 *   prediction…) — not a generic symbol
 * - Stylized fresco figures, never photorealistic people; subtle, not didactic
 * - No text in images (typography is for the HTML)
 * - Consistent style across all publications
 *
 * Provider: OpenAI gpt-image-2 (state-of-the-art image generation, uses existing OPENAI_API_KEY).
 * Visual concept: OpenAI gpt-6-astra (frontier reasoning for article analysis → motif derivation).
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
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'high',
        output_format: 'webp',
        output_compression: 85,
      }, {
        timeout: 180000,
        retries: 1,
        rateLimiterKey: 'openai-image',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }).catch((err: any) => {
        console.warn(`[HERO IMAGE] gpt-image-2 error: ${err.message?.slice(0, 200)}`);
        return null;
      });

      if (data) {
        const b64 = data.data?.[0]?.b64_json;
        const url = data.data?.[0]?.url;
        // Size guard: if base64 > 2MB (~2.67M chars), use SVG fallback instead.
        // WebP output (output_format: 'webp', compression 85) keeps typical
        // heroes at ~200-500KB — far under the cap; the guard stays as backstop.
        const MAX_B64_CHARS = 2_670_000; // ~2MB decoded
        if (b64 && b64.length > MAX_B64_CHARS) {
          console.warn(`[HERO IMAGE] base64 too large (${(b64.length / 1024).toFixed(0)}KB chars) — using SVG fallback`);
        } else if (b64) {
          const imageUrl = `data:image/webp;base64,${b64}`;
          console.log(`[HERO IMAGE] ✅ Generated via gpt-image-2 (${(b64.length / 1024).toFixed(0)}KB, cost ~$0.04)`);
          return { url: imageUrl, prompt, costUsd: 0.04, cached: false };
        } else if (url) {
          console.log(`[HERO IMAGE] ✅ Generated via gpt-image-2 (URL, cost ~$0.04)`);
          return { url, prompt, costUsd: 0.04, cached: false };
        }
      }
    } else {
      console.warn('[HERO IMAGE] No OPENAI_API_KEY — skipping gpt-image-2');
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

The art direction is FIXED and you never change it — GREEK EPIC FRESCO × ARTIFICIAL INTELLIGENCE, ON MANDATORY BLACK:
- THE GROUND IS BLACK. Deep obsidian darkness dominates the frame (≥60% near-black void). The fresco is an island of pigment inside the dark — it dissolves into black at the edges. NEVER a fully lit wall, NEVER a beige or tan plaster ground filling the frame. The site is stark black-and-white; the image must sit inside that.
- Every image looks like a rediscovered ancient fresco fragment lit by a single beam: mineral pigments on weathered plaster — lapis blue, terracotta, cinnabar red, verdigris, gold leaf — emerging from and consumed by deep obsidian-black ground
- The mythic scene is fused with machine intelligence: fine luminous filaments (pale gold, steel-blue) woven into drapery and figures, glowing seams tracing the plaster's cracks, faint sacred-geometry overlays
- Cinematic and monumental — the fresco fills the frame like a temple wall lit by a single shaft of light
- Stylized fresco figures — Greek gods, draped beings, mythic creatures — in profile or frontal like vase-painting and Pompeian frescoes. NEVER photorealistic people
- NEVER a literal scene of modern technology — the AI is felt through light, geometry, and precision inside the ancient image

The MOTIF — the central mythic element — must embody the article's tension through SUBTLETY:
- Pick ONE myth, figure, or sacred object whose essence mirrors the article's core tension
- The myth is the metaphor — the viewer who knows the myth feels the article's stakes
- The figure/scene carries the tension IN ITS POSE OR STATE — strained, suspended, mid-transformation, bearing weight, poised at a threshold
- NEVER literal illustration of the article's subject — mythic resonance, not a diagram

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

STEP 1 — CORE TENSION: What is the single most important tension, contradiction, or mechanism in this article? One sentence.

STEP 2 — THE MYTH: Which Greek myth, god, or sacred image embodies this tension? Candidates include but are not limited to: Icarus (overreach), Atlas (structural burden), Prometheus (dangerous gift of fire/technology), Sisyphus (futile cycles), the Labyrinth and Ariadne's thread (complexity and navigation), the Oracle of Delphi (prediction and ambiguity), Nemesis (retribution), Themis (judgment, law), Hydra (multiplying threats), Theseus's ship (identity through change), Ouroboros (self-consuming systems), Chronos (time devouring), Cassandra (warnings ignored), Pandora (irreversible release), the Moirai cutting thread (irreversible decision), Hephaestus's forge (building power), Janus-like doubled faces (two-faced institutions), Odysseus bound to the mast (self-binding against temptation).

STEP 3 — THE FUSION: How does machine intelligence inhabit this fresco? Luminous filaments replacing hair or drapery threads, a glowing seam along a crack, gold-leaf circuitry following a figure's gesture, sacred geometry faintly overlaid. Keep it woven INTO the ancient surface — not pasted on top.

STEP 4 — THE METAPHOR TEST: Someone who has NOT read the article sees this fresco. Can they feel the general tension from the myth alone? If the myth's connection to the article is too obscure, pick a clearer myth.

## EXAMPLES

PASS — mythic, specific, felt:
- Article: "institutional collapse"
  Motif: "The fresco shows Atlas under a cracked celestial sphere — but the sphere is made of interlocking luminous geometric panels, one visibly slipping. His drapery is woven with faint steel-blue filaments. The gold-leaf seams along the sphere's cracks glow brighter at the failing joint. Craquelure radiates from the point of failure."
  Why it passes: Atlas = structural burden; the slipping panel and glowing crack carry the collapse — myth, not diagram

- Article: "competing regulatory regimes"
  Motif: "Two enthroned gods face each other across a broken frieze — one rendered in lapis and cool filaments, the other in terracotta and gold — their drapery woven with luminous threads that fray and spark where they almost touch at the broken center."
  Why it passes: two divine orders in frozen confrontation, tension at the boundary — felt through color and fraying light

- Article: "AI prediction systems"
  Motif: "The Oracle of Delphi as a veiled fresco figure on a tripod — but the vapor rising beneath her resolves into fine luminous geometric spirals, and her silhouette is half pigment, half woven light-filaments. Around her, gold-leaf constellations."
  Why it passes: the Oracle IS prediction; the luminous vapor is machine intelligence — the fusion is the subject

FAIL — too literal, didactic, cringe:
- "A robot in a toga" → FAIL: a modern robot pasted into antiquity — kitsch, not fresco
- "A god literally holding a smartphone" → FAIL: anachronism played for laughs, didactic
- "Zeus throwing lightning at a data center" → FAIL: literal subject illustration
- "Chaos monsters on the left, ordered gods on the right" → FAIL: split-screen diagram

## RULES

1. ONE mythic figure or tableau — a single focal myth, not a crowded pantheon
2. The tension lives IN the myth's essence and the figure's state — not in a layout
3. SUBTLE — felt resonance, not a decoded diagram
4. Specific to THIS article — the myth is chosen for the core tension, not randomly
5. Fresco texture always: mineral pigments, craquelure, worn plaster on obsidian ground
6. The AI fusion = luminous filaments, glowing seams, sacred geometry — NEVER literal modern tech objects
7. Figures allowed and encouraged — but fresco-stylized (profile, draped, symbolic), never photorealistic people
8. THUMBNAIL READABILITY — the image will be cropped to a ~96px-tall strip in cards: the figure must fill 50-70% of frame height, read as a clear silhouette, and stay recognizable when tiny. Prefer close framing over wide scenes.
9. LIMITED PALETTE — at most 3 mineral pigments plus the luminous gold/steel filaments. A restrained palette survives small sizes; a busy one turns to mud.
10. NO: text, letters, UI, diagrams, clocks, brains, lightbulbs, gears, literal circuit boards, maps, charts
11. NO: split-screen, before/after, chaos-on-one-side/order-on-the-other
12. Describe the scene in 2-3 sentences: the myth, the figure's state/pose, and how the luminous machine fusion inhabits it.

Respond with ONLY the motif description. No preamble, no explanation, no step labels, no markdown.`;

    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are the visual art director for NomosX, the first AI think tank. You specialize in editorial cover illustrations in the NomosX style — ancient Greek fresco (gods, myths, mineral pigments, craquelure) fused with machine intelligence (luminous filaments, glowing seams, sacred geometry). You choose the ONE myth that embodies the article\'s core tension and describe how machine light inhabits it. You output only concrete motif descriptions. No commentary, no explanation.' },
        { role: 'user', content: userContent },
      ],
      provider: 'openai',
      model: 'gpt-6-astra',
      task: 'reader_v3' as any, // task used for timeout fallback only
      maxTokens: 200,
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
    if (concept.length < 20 || concept.length > 900) {
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
- Minimalist: a SINGLE mythic figure dominating the fresco — one gesture, one instant
- Tight, focused composition with strong obsidian negative space around the figure
- Sense of urgency or alert — the figure caught mid-action, a luminous filament flaring
- No clutter — the eye goes immediately to the one element that matters`;
    case 'DECISION_MEMO':
      return `COMPOSITION (Decision Memo — structured decision format):
- A poised, frontal tableau — one figure held at a moment of choice or judgment
- A sense of threshold: the figure poised between two states, a scale or balance in gold-leaf light
- The composition should feel like a decision about to be rendered — tension held in balance
- Hieratic clarity, not ambiguity`;
    case 'STRATEGIC_REPORT':
      return `COMPOSITION (Strategic Report — comprehensive strategic format):
- Monumental fresco scale: a vast wall with layered depth — the main figure foregrounded, secondary echoes fading into the plaster behind
- Sense of epic scope — the mythic scene embedded in a larger temple-space of pigment and darkness
- The motif is the anchor, but the weathered fresco surface extends beyond it
- Epic, sweeping composition with layered depth`;
    case 'ARTICLE':
    default:
      return `COMPOSITION (Article — long-form analytical format):
- Layered fresco composition — a central mythic figure with supporting elements fading into the plaster
- Balanced but not symmetrical — the eye moves across the wall discovering detail in pigment and light
- The motif is the anchor but the weathered surface tells part of the story too
- Cinematic framing with intentional obsidian negative space`;
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
    ? `SUBJECT — the mythic figure or tableau, derived from the article's actual findings:
${visualConcept}

This mythic scene is the FOCAL POINT of the image — a single tableau emerging from the obsidian ground. The surrounding darkness is the chaos; the ordered mythic figure is the nomos. The viewer should FEEL the article's tension through the myth — not decode a diagram.`
    : `SUBJECT — choose a Greek mythic figure or tableau that embodies the article title:
"${title}"
A single mythic image rendered as a rediscovered fresco:
- "Overreach/hubris" → Icarus mid-fall, wings dissolving into luminous filaments
- "Burden/structural weight" → Atlas straining under a cracked celestial sphere of glowing geometric panels
- "Dangerous gift/technology" → Prometheus offering fire that burns as woven gold-and-blue filaments
- "Foresight/prediction" → the veiled Oracle on her tripod, vapor resolving into luminous spirals
- "Complexity/navigation" → Ariadne's glowing thread winding through a dark labyrinth
- "Irreversible release" → Pandora's vessel opened, luminous mist escaping in geometric spirals
- "Judgment/law" → Themis's profile, her scale traced in gold-leaf light
The myth must feel commissioned for THIS article — not a generic classical scene.`;

  const compositionBlock = formatCompositionDirectives(publicationType);

  return `Create a premium editorial cover image for NomosX — the first AI think tank. Our DNA is "From Chaos to Nomos": we transform fragmented information into ordered, defensible positions. Our visual identity is GREEK EPIC FRESCO × ARTIFICIAL INTELLIGENCE — mythic figures rendered as rediscovered ancient frescoes, inhabited by luminous machine light.

ARTICLE: "${title}"
DOMAINS: ${contextTerms || 'strategic analysis and policy'}

1. SCENE & BACKGROUND — THE DARK IS MANDATORY
Deep obsidian-black darkness DOMINATES the frame — at least 60% of the image is near-black void (#050507 to #0d0d12). This is non-negotiable: the image lives on a stark black-and-white editorial interface, so it must feel like it emerged from darkness, not a lit museum wall. The frescoed surface appears only where light rakes across it — an island of pigment in the void. At the edges, the plaster and figures DISSOLVE into pure black — no visible wall boundary, no frame edges, no beige/tan ground showing. Faint sacred-geometry lines (circles, meridians, meander fragments) are etched into the dark ground, barely visible. Atmospheric dust catches the single shaft of light. The surrounding black is the chaos — felt, not shown literally. No split-screen, no "before/after" layout.

2. ${subjectBlock}

3. ${compositionBlock}

THUMBNAIL-READABILITY (hard requirement — the image is also shown as a ~96px-tall card strip):
- The mythic figure fills 50-70% of the frame height — close, monumental framing, not a distant scene
- The figure reads as a strong silhouette against the plaster — clear pigment/darkness contrast
- Center-weighted composition: the left and right edges may be cropped — nothing essential within 15% of either edge
- Maximum 3 pigment colors (lapis, terracotta, cinnabar, ochre, bone white) plus the luminous filaments — restrained palette, never busy

4. LIGHTING & COLOR
- ONE narrow shaft of light rakes across the surface — like a single beam through a temple doorway. Everything outside that beam falls to black
- The lit zone is tight: it reveals pigment texture, craquelure, and the luminous machine elements — then dies into darkness within the frame
- Fresco pigment palette on obsidian ground: lapis blue (#26418F), terracotta (#B65438), cinnabar red, verdigris (#4F8577), ochre, bone white — weathered, matte, mineral
- Machine intelligence expressed as LIGHT: fine luminous filaments in pale gold (#C9A24B) and steel-blue (#7FB2D9) woven into drapery, hair, or tracing the plaster's cracks like kintsugi seams
- The luminous elements are woven INTO the fresco surface — they belong to the ancient image, not pasted on top
- High contrast between the lit fresco island and the surrounding obsidian void — the edge of the lit zone should read as darkness reclaiming the image

5. VISUAL TREATMENT
- Fresco painting technique elevated to cinematic epic — Pompeian wall painting, Minoan fresco, Attic vase-figure elegance — rendered with monumental cinematic lighting
- Stylized figures: draped gods, mythic beings, profile or frontal like ancient wall painting — NEVER photorealistic people
- Style references: a lost fresco photographed by torchlight in a temple vault; The Atlantic editorial gravitas; museum-grade epic
- Matte mineral texture everywhere — pigments, plaster grain, craquelure; the luminous filaments are the only "digital" note
- The machine elements glow softly — like light trapped inside the plaster — never neon, never sci-fi chrome
- Cinematic, premium, authoritative. Subtle, not didactic. The viewer feels the meaning — they don't decode a diagram.

6. CONSTRAINTS — DO NOT INCLUDE
- No text, no letters, no numbers, no words anywhere in the image
- No photorealistic humans — figures must be fresco-stylized (painted, symbolic, like ancient wall art)
- No modern technology objects: no robots, no smartphones, no computers, no literal circuit boards, no server racks
- No logos, no UI elements, no diagrams, no charts, no infographics
- No clocks, no brains, no lightbulbs, no gears, no DNA helices, no globes, no maps, no network graphs
- No neon palette, no cyberpunk chrome, no holograms
- No light or warm-toned background — NO beige/tan/cream plaster wall filling the frame, NO blue sky, NO daylight scene. The ground is obsidian black.
- No collage, no split-screen, no multi-panel layout, no "before/after" arrangement
- No literal illustrations of the article's modern subject — mythic resonance only
- No stock photo clichés, no generic "AI" imagery
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
    svg += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="rgba(201,162,75,${op.toFixed(3)})"/>`;
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
    svg += `<rect x="${archX.toFixed(0)}" y="${(archY + archRadius).toFixed(0)}" width="${archThickness}" height="${(archH - archRadius).toFixed(0)}" fill="rgba(201,162,75,0.04)" stroke="rgba(201,162,75,0.10)" stroke-width="1"/>`;
    // Right pillar
    svg += `<rect x="${(archX + archW - archThickness).toFixed(0)}" y="${(archY + archRadius).toFixed(0)}" width="${archThickness}" height="${(archH - archRadius).toFixed(0)}" fill="rgba(201,162,75,0.06)" stroke="rgba(201,162,75,0.14)" stroke-width="1"/>`;
    // Arch curve (top)
    svg += `<path d="M ${archX} ${(archY + archRadius).toFixed(0)} A ${outerR} ${outerR} 0 0 1 ${(archX + archW).toFixed(0)} ${(archY + archRadius).toFixed(0)} L ${(archX + archW - archThickness).toFixed(0)} ${(archY + archRadius).toFixed(0)} A ${innerR} ${innerR} 0 0 0 ${(archX + archThickness).toFixed(0)} ${(archY + archRadius).toFixed(0)} Z" fill="rgba(201,162,75,0.05)" stroke="rgba(201,162,75,0.12)" stroke-width="1"/>`;
    // Subtle fracture on the left pillar (a hairline crack)
    const crackY = archY + archRadius + 100 + rng() * 200;
    svg += `<line x1="${(archX + archThickness * 0.5).toFixed(0)}" y1="${crackY.toFixed(0)}" x2="${(archX + archThickness * 0.3).toFixed(0)}" y2="${(crackY + 40).toFixed(0)}" stroke="rgba(201,162,75,0.08)" stroke-width="0.6"/>`;
  } else if (formType === 1) {
    // ── MONOLITH: a single tall rectangular form, slightly leaning ──
    const monW = 280;
    const monH = 700;
    const lean = 3; // slight lean in degrees
    const monX = cx - monW / 2;
    const monY = cy - monH / 2;
    const transform = `rotate(${lean} ${cx} ${cy})`;
    svg += `<rect x="${monX.toFixed(0)}" y="${monY.toFixed(0)}" width="${monW}" height="${monH}" transform="${transform}" fill="rgba(201,162,75,0.05)" stroke="rgba(201,162,75,0.12)" stroke-width="1" rx="2"/>`;
    // Subtle surface lines (material texture)
    for (let i = 0; i < 5; i++) {
      const ly = monY + 100 + i * 120 + rng() * 40;
      svg += `<line x1="${(monX + 20).toFixed(0)}" y1="${ly.toFixed(0)}" x2="${(monX + monW - 20).toFixed(0)}" y2="${(ly + (rng() - 0.5) * 10).toFixed(0)}" transform="${transform}" stroke="rgba(201,162,75,0.04)" stroke-width="0.4"/>`;
    }
  } else {
    // ── APERTURE: a rectangular frame with light cutting through the opening ──
    const apW = 400;
    const apH = 560;
    const apX = cx - apW / 2;
    const apY = cy - apH / 2;
    const frameThickness = 50;
    // Frame
    svg += `<rect x="${apX.toFixed(0)}" y="${apY.toFixed(0)}" width="${apW}" height="${apH}" fill="none" stroke="rgba(201,162,75,0.10)" stroke-width="${frameThickness}" stroke-linejoin="miter"/>`;
    // Inner opening — slightly lighter (light coming through)
    svg += `<rect x="${(apX + frameThickness / 2).toFixed(0)}" y="${(apY + frameThickness / 2).toFixed(0)}" width="${(apW - frameThickness).toFixed(0)}" height="${(apH - frameThickness).toFixed(0)}" fill="rgba(201,162,75,0.015)"/>`;
    // One edge of the frame slightly fractured
    const fracY = apY + 80 + rng() * 200;
    svg += `<line x1="${apX.toFixed(0)}" y1="${fracY.toFixed(0)}" x2="${(apX - 8).toFixed(0)}" y2="${(fracY + 25).toFixed(0)}" stroke="rgba(201,162,75,0.06)" stroke-width="0.5"/>`;
  }

  // ── Light shaft: subtle diagonal volumetric light from upper-right ──
  svg += `<defs>`;
  svg += `<linearGradient id="lightShaft" x1="0.75" y1="0" x2="0.25" y2="1" gradientUnits="objectBoundingBox">`;
  svg += `<stop offset="0%" stop-color="rgba(201,162,75,0.06)"/>`;
  svg += `<stop offset="50%" stop-color="rgba(201,162,75,0.02)"/>`;
  svg += `<stop offset="100%" stop-color="rgba(201,162,75,0)"/>`;
  svg += `</linearGradient>`;
  svg += `<radialGradient id="formGlow" cx="0.65" cy="0.35" r="0.5" gradientUnits="objectBoundingBox">`;
  svg += `<stop offset="0%" stop-color="rgba(201,162,75,0.04)"/>`;
  svg += `<stop offset="100%" stop-color="rgba(201,162,75,0)"/>`;
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
