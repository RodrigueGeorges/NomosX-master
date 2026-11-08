#!/usr/bin/env node
/**
 * Side-by-side captures: spacex.com vs NomosX homepage + brief V2.
 * Output: scripts/compare-output/
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = CHROME_PATHS.find(existsSync);
if (!executablePath) {
  console.error('Chrome not found');
  process.exit(1);
}

const outDir = resolve('scripts/compare-output');
mkdirSync(outDir, { recursive: true });

const BRIEF_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>NomosX Brief V2</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--nx-bg:#000;--nx-text-hero:#f0f0fa;--nx-text-primary:#f0f0fa;--nx-text-secondary:rgba(240,240,250,.62);--nx-text-tertiary:rgba(240,240,250,.35);--nx-border-subtle:rgba(240,240,250,.08);--nx-read-max-width:42rem;--nx-read-size:1.0625rem;--nx-read-lh:1.75;--nx-read-color:rgba(240,240,250,.78);--nx-font-heading:'Barlow Semi Condensed',sans-serif;--nx-font-body:'Barlow',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}body{background:#000}
article{max-width:52rem;margin:0 auto;padding:3rem 2rem;font-family:var(--nx-font-body);font-size:var(--nx-read-size);line-height:var(--nx-read-lh);color:var(--nx-read-color);background:#000}
.brief-hero{margin-bottom:3rem;padding-bottom:2rem;border-bottom:1px solid var(--nx-border-subtle)}
.brief-brand{font-size:.625rem;letter-spacing:.1em;text-transform:uppercase;color:var(--nx-text-tertiary);margin-bottom:1rem}
.nx-eyebrow{font-size:.625rem;letter-spacing:.1em;text-transform:uppercase;color:var(--nx-text-tertiary);margin-bottom:.75rem}
h1{font-family:var(--nx-font-heading);font-size:clamp(2rem,5vw,3.75rem);font-weight:600;line-height:.92;letter-spacing:-.01em;text-transform:uppercase;color:var(--nx-text-hero);margin-bottom:1rem;max-width:20ch}
.collision-line{color:var(--nx-text-secondary);margin-bottom:.5rem;max-width:var(--nx-read-max-width)}
.nx-block{border:1px solid var(--nx-border-subtle);background:rgba(240,240,250,.02);padding:1.5rem;margin:1.5rem 0;border-radius:4px}
.verdict-block{border-left:3px solid var(--nx-text-primary);padding-left:1.25rem;max-width:var(--nx-read-max-width);margin-top:1rem}
.verdict-block p{margin-bottom:1.25em}
</style></head><body>
<article>
<header class="brief-hero">
<div class="brief-brand">Nomos<span style="color:var(--nx-text-primary)">X</span></div>
<p class="nx-eyebrow">Detected subject</p>
<h1>Carbon border adjustments × AI supply chains</h1>
<p class="collision-line">Climate policy × Automation</p>
<p class="collision-line">Regulatory friction meets algorithmic routing — a collision reshaping trade compliance economics.</p>
</header>
<section class="nx-block"><p class="nx-eyebrow">Institute position</p>
<div class="verdict-block"><p>NomosX holds that carbon border adjustments will accelerate adoption where AI-driven supply chain tooling reduces compliance friction — but divergence across jurisdictions creates arbitrage windows of 18–36 months [SRC-1][SRC-4].</p><p>Confidence remains medium: empirical trade elasticity data is thin for dual-policy regimes.</p></div>
</section>
</article></body></html>`;

const briefPath = resolve(outDir, 'nomosx-brief-v2.html');
writeFileSync(briefPath, BRIEF_HTML);

const PORT = process.env.PORT || '3000';
const base = `http://localhost:${PORT}`;

const targets = [
  { name: 'spacex-home', url: 'https://www.spacex.com', width: 1440, height: 900 },
  { name: 'spacex-starship', url: 'https://www.spacex.com/vehicles/starship/', width: 1440, height: 900 },
  { name: 'nomosx-home', url: `${base}/`, width: 1440, height: 900, needsServer: true },
  { name: 'nomosx-brief-v2', url: `file:///${briefPath.replace(/\\/g, '/')}`, width: 1440, height: 1200 },
];

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
});

for (const t of targets) {
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: t.width, height: t.height });
    await page.goto(t.url, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.screenshot({ path: resolve(outDir, `${t.name}.png`), fullPage: false });
    console.log(`✓ ${t.name}.png`);
    await page.close();
  } catch (err) {
    console.warn(`✗ ${t.name}:`, err.message);
  }
}

// Composite row: spacex | nomosx home | brief
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const html = `<!DOCTYPE html><html><head><style>
    body{margin:0;background:#111;color:#fff;font-family:system-ui,sans-serif}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px}
    img{width:100%;height:auto;border:1px solid #333}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;padding:8px;text-align:center;color:#888}
  </style></head><body>
  <div class="row">
    <div><h2>spacex.com</h2><img src="file:///${resolve(outDir,'spacex-home.png').replace(/\\/g,'/')}"/></div>
    <div><h2>nomosx homepage</h2><img src="file:///${resolve(outDir,'nomosx-home.png').replace(/\\/g,'/')}"/></div>
    <div><h2>brief V2</h2><img src="file:///${resolve(outDir,'nomosx-brief-v2.png').replace(/\\/g,'/')}"/></div>
  </div></body></html>`;
  const compositePath = resolve(outDir, '_composite.html');
  writeFileSync(compositePath, html);
  await page.goto(`file:///${compositePath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(outDir, 'COMPARE-side-by-side.png'), fullPage: true });
  console.log('✓ COMPARE-side-by-side.png');
  await page.close();
} catch (e) {
  console.warn('Composite failed:', e.message);
}

await browser.close();
console.log(`\nOutput: ${outDir}`);
