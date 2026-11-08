/**
 * Generate commissioned fresco portraits for the NomosX Council desks.
 *
 * Each desk is embodied by its patron mythological figure (see
 * lib/brand/researcher-portraits.ts) rendered in the same DA as
 * publication heroes: rediscovered ancient fresco on obsidian ground,
 * mineral pigments, luminous machine filaments — but as a PORTRAIT
 * (head-and-shoulders / upper-body, square format) built for avatar
 * display at 40-96px.
 *
 * Output: public/researchers/{deskId}.webp (static files, no DB bloat).
 *
 * Usage:
 *   node --import tsx scripts/gen-researcher-portraits.ts            # missing only
 *   node --import tsx scripts/gen-researcher-portraits.ts --force    # regenerate all
 *   node --import tsx scripts/gen-researcher-portraits.ts --only=security,technology
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import * as fs from 'fs';
import * as path from 'path';
import { DESK_PORTRAITS, deskPortraitUrl } from '../lib/brand/researcher-portraits';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const OUT_DIR = path.resolve(__dirname, '../public/researchers');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_ARG = args.find((a) => a.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.split('=')[1].split(',') : null;

function buildPortraitPrompt(p: (typeof DESK_PORTRAITS)[string], deskName: string): string {
  return `Create a premium editorial portrait for NomosX — the first AI think tank. Visual identity: GREEK EPIC FRESCO × ARTIFICIAL INTELLIGENCE — mythic figures rendered as rediscovered ancient frescoes, inhabited by luminous machine light.

SUBJECT: ${p.figure} (${p.greekName}) — ${p.archetype}. This is the patron figure of the "${deskName}" research desk.

1. SCENE & BACKGROUND — THE DARK IS MANDATORY
Deep obsidian-black darkness DOMINATES the square frame — at least 55% near-black void (#050507 to #0d0d12). The frescoed surface appears only where a single shaft of light rakes across it — an island of pigment in the void, dissolving into pure black at the edges. NO lit museum wall, NO beige/tan plaster ground, NO sky, NO frame border. Faint sacred-geometry etchings barely visible in the dark ground.

2. THE FIGURE — PORTRAIT FRAMING (locked visual identity)
${p.visualDna}
- Head-and-shoulders / upper-body portrait — the head occupies 40-55% of frame height, centered or three-quarter, facing slightly into the light
- The figure is PAINTED — a fresco portrait like a Pompeian or Minoan wall painting: stylized profile/three-quarter view, strong silhouette, elongated grace, NEVER photorealistic, never a sculpture
- One symbolic attribute or companion element may accompany the figure (her own attribute — snake, owl, scales, staff, loom…) kept secondary to the head

3. THE MACHINE LIGHT — the desk's signature
${p.filamentMotif}
- The luminous filaments are woven INTO the fresco surface — they belong to the ancient image, glowing softly like light trapped in plaster. Never neon, never sci-fi chrome, never pasted-on circuitry.

4. LIGHTING & COLOR
- ONE narrow shaft of light rakes across the figure — temple light; everything outside the beam dies into black
- Mineral fresco pigments, weathered and matte: lapis blue, terracotta, cinnabar, verdigris, ochre, bone white — maximum 3 pigments plus luminous filaments (pale gold #C9A24B, steel-blue #7FB2D9)
- High contrast: lit pigment island vs obsidian void — the face must read at 40px

5. VISUAL TREATMENT
- Fresco technique elevated to cinematic epic — craquelure, plaster grain, worn pigment
- Stylized fresco figure — symbolic, hieratic, beautiful; The Atlantic editorial gravitas; a lost portrait photographed by torchlight in a temple vault

6. CONSTRAINTS — DO NOT INCLUDE
- No text, no letters, no numbers, no words
- No photorealistic humans — fresco-stylized only
- No modern objects: no robots, devices, circuit boards, screens
- No marble statues or sculpture — this is a PAINTING, a fresco
- No light/warm background — the ground is obsidian black
- No collage, no multiple figures in a crowd — ONE figure
- Output: square portrait, cohesive single image`;
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('No OPENAI_API_KEY in env');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const desks = Object.values(DESK_PORTRAITS).filter((p) => {
    if (ONLY && !ONLY.includes(p.id)) return false;
    const f = path.join(OUT_DIR, `${p.id}.webp`);
    return FORCE || !fs.existsSync(f);
  });

  console.log(`[PORTRAITS] ${desks.length} to generate (force=${FORCE})`);
  let done = 0, failed = 0, cost = 0;

  for (const p of desks) {
    const deskName = `${p.figure} — ${p.id} desk`;
    console.log(`\n[${++done + failed}/${desks.length}] ${p.id} → ${p.figure}`);
    try {
      const res = await fetch(IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: buildPortraitPrompt(p, deskName),
          n: 1,
          size: '1024x1024',
          quality: 'high',
          output_format: 'webp',
          output_compression: 85,
        }),
        signal: AbortSignal.timeout(240000),
      }).catch((err: any) => {
        console.warn(`  ✗ request error: ${err.message?.slice(0, 200)}`);
        return null;
      });
      const data: any = res?.ok ? await res.json() : (console.warn(`  ✗ HTTP ${res?.status}: ${(await res?.text())?.slice(0, 200)}`), null);

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) { console.warn('  ✗ no image returned'); failed++; continue; }

      const out = path.join(OUT_DIR, `${p.id}.webp`);
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      cost += 0.04;
      console.log(`  ✓ ${p.id}.webp (${(b64.length / 1024).toFixed(0)}KB b64)`);
    } catch (err: any) {
      console.warn(`  ✗ failed: ${err.message?.slice(0, 160)}`);
      failed++;
    }
    if (done + failed < desks.length) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n[PORTRAITS] done — ${desks.length - failed}/${desks.length} generated, ${failed} failed, ~$${cost.toFixed(2)}`);
  console.log(`[PORTRAITS] served at ${deskPortraitUrl('<id>')}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
