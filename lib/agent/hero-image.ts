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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';

export interface HeroImageResult {
  url: string;
  prompt: string;
  costUsd: number;
  cached: boolean;
}

/**
 * Generate a hero image for a publication.
 *
 * Uses OpenAI gpt-image-1 as primary provider (thematically rich images).
 * Falls back to a deterministic SVG geometric pattern on failure.
 *
 * @param title - Publication title
 * @param collision - Domain collision label (e.g., "AI Regulation × Geopolitics")
 * @param domain - Primary domain
 * @returns HeroImageResult or null on failure
 */
export async function generateHeroImage(
  title: string,
  collision: string,
  domain: string,
): Promise<HeroImageResult | null> {
  const prompt = buildImagePrompt(title, collision, domain);

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
          size: '1536x1024',
          quality: 'high',
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        const url = data.data?.[0]?.url;
        const imageUrl = b64 ? `data:image/png;base64,${b64}` : url;
        if (imageUrl) {
          console.log(`[HERO IMAGE] ✅ Generated via gpt-image-1 (cost ~$0.02)`);
          return { url: imageUrl, prompt, costUsd: 0.02, cached: false };
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
 * Build a premium, cinematic image prompt aligned with NomosX brand identity.
 *
 * The prompt produces a uniform, atmospheric illustration — not 2D line art.
 * It analyzes the article title to create a specific visual metaphor rendered
 * as a cinematic dark scene with depth, shadow, and dimensionality.
 */
function buildImagePrompt(title: string, collision: string, domain: string): string {
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

  return `Create a premium, sophisticated cover image for a high-end think tank report.

SUBJECT: "${title}"
DOMAINS: ${contextTerms || 'strategic analysis and policy'}

ART DIRECTION:
- A single, cohesive, uniform visual — not a collage, not a diagram, not a line drawing
- Rich, atmospheric, cinematic quality — like a rendered 3D scene or a matte painting
- Deep black background with subtle volumetric depth and soft directional lighting
- Monochrome palette: charcoal blacks, deep greys, soft silver-whites. No saturated colors.
- The scene should feel like a physical space or sculptural object rendered in dark metallic tones
- Style reference: Denis Villeneuve film stills, The Atlantic editorial illustrations, Wired cover art

CONCEPT:
Analyze the core tension in the title. Translate it into a specific, dramatic visual metaphor:
- "Threshold" or "discontinuity" → a vast dark architectural space with a dramatic gateway or barrier, light streaming through a narrow opening creating a sharp divide
- "Convergence" of domains → two massive structural forms merging or colliding in a dark void
- "Vacuum" or "gap" → a void or absence within an otherwise dense, monumental structure
- "Cost" or "impact" → force or pressure visibly acting on architectural or sculptural forms
- "Ceiling" or "limit" → a vast overhead structure pressing down on forms below
The image must feel commissioned specifically for THIS article — not a stock illustration.

MOOD: Authoritative, mysterious, monumental, premium. Dark, volumetric, cinematic.

TECHNICAL:
- 16:9 widescreen cinematic composition with intentional negative space
- Soft volumetric lighting from one direction creating depth and shadow
- Subtle depth of field
- Uniform rendering quality — no flat 2D elements mixed with 3D
- No text, no letters, no numbers, no human figures, no logos, no UI elements`;
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
