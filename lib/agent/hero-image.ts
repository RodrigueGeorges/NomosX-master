/**
 * NomosX Hero Image Generator — generates conceptual abstract images
 * for publication heroes using DALL-E 3.
 *
 * Design philosophy:
 * - Minimalist, dark, geometric — NomosX brand identity
 * - Conceptual: visual metaphor for the domain collision, not literal
 * - No text in images (typography is for the HTML)
 * - Consistent style across all publications
 *
 * Cost: ~$0.04 per image (DALL-E 3 standard quality, 1024x1024)
 * Fallback: returns null on failure (graceful degradation — no image)
 */

import { prisma } from '../db';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DALLE_ENDPOINT = 'https://api.openai.com/v1/images/generations';

export interface HeroImageResult {
  url: string;
  prompt: string;
  costUsd: number;
  cached: boolean;
}

/**
 * Generate a hero image for a publication.
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
  if (!OPENAI_API_KEY) {
    console.warn('[HERO IMAGE] No OPENAI_API_KEY — skipping image generation');
    return null;
  }

  // Build a conceptual prompt — abstract, dark, geometric
  const prompt = buildImagePrompt(title, collision, domain);

  try {
    console.log(`[HERO IMAGE] Generating for: "${title.slice(0, 60)}..."`);

    const res = await fetch(DALLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn(`[HERO IMAGE] DALL-E API error ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) {
      console.warn('[HERO IMAGE] No image URL in response');
      return null;
    }

    console.log(`[HERO IMAGE] ✅ Generated (cost ~$0.04)`);
    return {
      url,
      prompt,
      costUsd: 0.04,
      cached: false,
    };
  } catch (err: any) {
    console.warn(`[HERO IMAGE] Failed: ${err.message}`);
    return null;
  }
}

/**
 * Build a DALL-E prompt that produces consistent, brand-aligned images.
 *
 * Style: Dark, minimalist, geometric abstraction.
 * The image should evoke the collision of domains without being literal.
 */
function buildImagePrompt(title: string, collision: string, domain: string): string {
  // Extract domain keywords for visual metaphor
  const domains = collision.split('×').map(d => d.trim().toLowerCase());

  const metaphors: Record<string, string> = {
    'ai-technology': 'neural networks, circuit patterns, glowing nodes',
    'ai-policy': 'regulatory frameworks, digital governance, algorithmic bias',
    'ai-safety': 'containment, safety barriers, alignment',
    'economics': 'market flows, supply curves, capital dynamics',
    'finance-macro': 'financial systems, monetary flows, banking architecture',
    'geopolitics': 'geographic boundaries, power projection, territorial dynamics',
    'climate': 'atmospheric layers, thermal patterns, environmental systems',
    'health-biotech': 'molecular structures, biological pathways, medical innovation',
    'biotechnology': 'genetic sequences, cellular mechanics, bioengineering',
    'cybersecurity': 'digital fortifications, encrypted channels, threat vectors',
    'energy': 'power grids, energy flows, resource extraction',
    'trade': 'supply chains, logistics networks, commercial routes',
    'eu-policy': 'institutional frameworks, regulatory architecture',
    'digital-governance': 'data governance, digital rights, platform regulation',
    'emerging-markets': 'growth trajectories, development dynamics',
    'social-stability': 'social networks, demographic shifts, civic dynamics',
    'science-frontier': 'scientific discovery, experimental frontiers',
    'security': 'defense systems, strategic positioning',
    'development': 'growth patterns, infrastructure development',
    'labor': 'workforce dynamics, employment patterns',
  };

  const visualElements = domains
    .map(d => metaphors[d] || '')
    .filter(Boolean)
    .join(', ');

  return `Create a minimalist abstract editorial illustration for a premium think tank publication. Pure black background (#000000). Monochrome palette only — white, light grey, and translucent white at varying opacities. No color, no accent hues, no warm tones. The image should evoke ${visualElements || 'analytical reasoning and strategic insight'} through fine geometric line work, thin architectural strokes, and subtle structural patterns suggesting data flows, networks, and causal relationships. Style: SpaceX-inspired minimalism — flat, precise, technical, authoritative. Think architectural blueprint meets data visualization, rendered in white-on-black with varying opacity. No gradients, no glow effects, no photographic elements, no human faces, no literal objects. No text, no letters, no numbers anywhere in the image. Wide cinematic composition, generous negative space, ultra-clean.`;
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
      data: { heroImageUrl: imageUrl } as any,
    });
  } catch (err) {
    console.warn(`[HERO IMAGE] Failed to save URL: ${err}`);
  }
}
