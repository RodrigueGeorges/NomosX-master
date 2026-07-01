#!/usr/bin/env node
/**
 * Rasterize public/favicon.svg → favicon.ico, apple-touch-icon, PWA PNGs.
 * Requires Chrome (puppeteer-core).
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const SVG_PATH = join(PUBLIC, 'favicon.svg');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];

const executablePath = CHROME_PATHS.find(existsSync);
if (!executablePath) {
  console.error('Chrome not found — skip PNG/ICO generation. SVG favicon still works.');
  process.exit(0);
}

const svg = readFileSync(SVG_PATH, 'utf8');

async function rasterize(size) {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">${svg.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`)}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buf = await page.screenshot({ type: 'png', omitBackground: false });
  await browser.close();
  return buf;
}

/** Minimal ICO writer (single 32×32 PNG embedded — sufficient for browsers). */
function pngToIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

async function main() {
  const sizes = [
    { name: 'icon-192.png', px: 192 },
    { name: 'icon-512.png', px: 512 },
    { name: 'apple-touch-icon.png', px: 180 },
    { name: 'favicon-32.png', px: 32 },
  ];

  for (const { name, px } of sizes) {
    const buf = await rasterize(px);
    writeFileSync(join(PUBLIC, name), buf);
    console.log(`✓ ${name} (${px}px)`);
  }

  const fav32 = readFileSync(join(PUBLIC, 'favicon-32.png'));
  writeFileSync(join(PUBLIC, 'favicon.ico'), pngToIco(fav32));
  console.log('✓ favicon.ico');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
