#!/usr/bin/env node
/** Visual QA captures for logo integration. */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'compare-output');
mkdirSync(OUT, { recursive: true });

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = CHROME_PATHS.find(existsSync);
if (!executablePath) {
  console.error('Chrome not found');
  process.exit(1);
}

const ROOT = join(__dirname, '..');
const faviconSvg = readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8');
const briefPath = join(OUT, 'nomosx-brief-v2.html');
const briefHtml = existsSync(briefPath)
  ? readFileSync(briefPath, 'utf8')
  : `<!DOCTYPE html><html><head><style>body{background:#000;color:#fff;padding:40px}</style></head><body><p>Brief preview unavailable</p></body></html>`;

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log('✓', name);
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

// Favicon 16px & 32px
for (const px of [16, 32]) {
  await page.setViewport({ width: 80, height: 80, deviceScaleFactor: 2 });
  await page.setContent(`<!DOCTYPE html><body style="margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;gap:16px;height:80px;padding:16px;">${faviconSvg.replace(/width="[^"]*"/, `width="${px}"`).replace(/height="[^"]*"/, `height="${px}"`)}</body>`);
  await shot(page, `logo-favicon-${px}px.png`);
}

// Light + dark lockup
const lockupHtml = (bg, fg) => `<!DOCTYPE html><html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;height:120px;color:${fg}">${readFileSync(join(ROOT, 'public', 'nomosx-lockup.svg'), 'utf8').replace('fill="none"', `fill="none" style="color:${fg}"`)}</body></html>`;

await page.setViewport({ width: 600, height: 120, deviceScaleFactor: 2 });
await page.setContent(lockupHtml('#000000', '#f0f0fa'));
await shot(page, 'logo-lockup-dark.png');

await page.setContent(lockupHtml('#ffffff', '#0a0a0a'));
await shot(page, 'logo-lockup-light.png');

// Nav mock
await page.setViewport({ width: 1280, height: 56, deviceScaleFactor: 2 });
await page.setContent(`<!DOCTYPE html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#000;font-family:system-ui}.nav{height:56px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;padding:0 32px;color:#fff}</style></head><body><nav class="nav">${readFileSync(join(ROOT, 'public', 'nomosx-lockup.svg'), 'utf8').replace('<svg', '<svg height="22" width="108" style="color:#fff"')}</nav></body></html>`);
await shot(page, 'logo-nav-mock.png');

await browser.close();
console.log('Captures → scripts/compare-output/');
