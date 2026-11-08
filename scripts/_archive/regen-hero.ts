/**
 * Regenerate the hero image for an existing publication HTML file.
 * Uses gpt-image-1 via OpenAI API, then replaces the <img src="..."> in the HTML.
 *
 * Usage:
 *   node --import tsx scripts/regen-hero.ts scripts/output-funnel.html
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs';

const htmlPath = process.argv[2] || 'scripts/output-funnel.html';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';

if (!OPENAI_API_KEY) {
  console.error('No OPENAI_API_KEY in .env.local');
  process.exit(1);
}

// Extract title from HTML
function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]+)<\/title>/);
  return m ? m[1].trim() : 'Untitled';
}

// Build the same premium prompt as lib/agent/hero-image.ts
function buildImagePrompt(title: string, collision: string, domain: string): string {
  return `Create a premium, sophisticated cover image for a high-end think tank report.

SUBJECT: "${title}"
DOMAINS: ${collision || 'strategic analysis and policy'}

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

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const title = extractTitle(html);
  console.log(`Title: ${title}`);
  console.log(`HTML size: ${html.length} chars`);

  // Detect collision from HTML if available (look for "collision" or "domains" meta)
  const collisionMatch = html.match(/data-collision="([^"]+)"/);
  const collision = collisionMatch ? collisionMatch[1] : 'AI interpretability × robustness × adversarial';
  const domain = 'technology';

  const prompt = buildImagePrompt(title, collision, domain);
  console.log(`\nCalling gpt-image-1 (size 1536x1024, quality high)...`);

  const res = await fetch(IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
    }),
    signal: AbortSignal.timeout(240000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`gpt-image-1 error ${res.status}: ${errText.slice(0, 400)}`);
    process.exit(1);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;

  if (!b64 && !url) {
    console.error('No image data returned:', JSON.stringify(data).slice(0, 400));
    process.exit(1);
  }

  let imageUrl: string;
  if (b64) {
    imageUrl = `data:image/png;base64,${b64}`;
    console.log(`✅ Got base64 image (${(b64.length / 1024).toFixed(0)}KB chars)`);
  } else {
    imageUrl = url!;
    console.log(`✅ Got URL image: ${url}`);
  }

  // Replace the <img src="data:image/svg+xml;base64,..."> in the hero figure
  // The hero figure is: <figure class="hero-image" ...><img src="..." .../></figure>
  const imgRegex = /(<figure class="hero-image"[^>]*>\s*<img src=")(data:image\/svg\+xml;base64,[^"]+)("[^>]*\/>\s*<\/figure>)/;
  const match = html.match(imgRegex);

  let newHtml: string;
  if (match) {
    newHtml = html.replace(imgRegex, `$1${imageUrl}$3`);
    console.log('✅ Replaced SVG hero image with gpt-image-1 result');
  } else {
    // Fallback: replace any <img src="data:image/svg+xml;base64,..."> inside hero-image figure
    const fallbackRegex = /(<figure class="hero-image"[^>]*>[\s\S]*?<img src=")(data:image\/svg\+xml;base64,[^"]+)("[^>]*\/>[\s\S]*?<\/figure>)/;
    const fbMatch = html.match(fallbackRegex);
    if (fbMatch) {
      newHtml = html.replace(fallbackRegex, `$1${imageUrl}$3`);
      console.log('✅ Replaced SVG hero image (fallback regex)');
    } else {
      console.warn('⚠️ Could not find hero-image figure in HTML — writing image URL only');
      fs.writeFileSync('scripts/regen-hero-image-url.txt', imageUrl, 'utf-8');
      console.log('Image URL/data saved to scripts/regen-hero-image-url.txt');
      process.exit(0);
    }
  }

  // Backup original
  fs.writeFileSync(htmlPath + '.bak-svg', html, 'utf-8');
  fs.writeFileSync(htmlPath, newHtml, 'utf-8');
  console.log(`✅ Wrote new HTML (${newHtml.length} chars) to ${htmlPath}`);
  console.log(`Original saved to ${htmlPath}.bak-svg`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
