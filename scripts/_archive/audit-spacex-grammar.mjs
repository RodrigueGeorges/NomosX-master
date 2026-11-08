#!/usr/bin/env node
/**
 * Extract computed design tokens from spacex.com for NomosX grammar audit.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];

const executablePath = CHROME_PATHS.find(existsSync);
if (!executablePath) {
  console.error('Chrome not found');
  process.exit(1);
}

const PAGES = [
  { name: 'homepage', url: 'https://www.spacex.com' },
  { name: 'starship', url: 'https://www.spacex.com/vehicles/starship/' },
];

function pickStyles(computed) {
  const keys = [
    'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
    'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius',
    'padding', 'margin', 'maxWidth', 'textTransform', 'boxShadow',
  ];
  const out = {};
  for (const k of keys) out[k] = computed[k];
  return out;
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const results = {};

for (const page of PAGES) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1440, height: 900 });
  await tab.goto(page.url, { waitUntil: 'networkidle2', timeout: 60000 });

  const data = await tab.evaluate(() => {
    const sample = (el, label) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        label,
        tag: el.tagName,
        text: (el.textContent || '').trim().slice(0, 80),
        className: el.className?.toString?.().slice(0, 120) || '',
      };
    };

    const h1 = document.querySelector('h1, h2, .section-header, [class*="title"]');
    const heroH = document.querySelector('h1') || document.querySelector('h2');
    const body = document.querySelector('p');
    const cta = [...document.querySelectorAll('a, button')].find((el) => {
      const t = (el.textContent || '').trim().toUpperCase();
      return ['WATCH', 'EXPLORE', 'LEARN MORE', 'RESERVE YOUR RIDE'].some((x) => t.includes(x));
    });
    const nav = document.querySelector('header a, nav a');
    const section = document.querySelector('section') || document.body;

    const els = [
      { el: heroH, label: 'hero-heading' },
      { el: h1, label: 'heading' },
      { el: body, label: 'body' },
      { el: cta, label: 'cta' },
      { el: nav, label: 'nav-link' },
      { el: section, label: 'section' },
      { el: document.body, label: 'body-root' },
    ];

    const styles = {};
    for (const { el, label } of els) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      styles[label] = {
        meta: sample(el, label),
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        borderWidth: cs.borderWidth,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        textTransform: cs.textTransform,
        boxShadow: cs.boxShadow,
        maxWidth: cs.maxWidth,
      };
    }

    // Collect @font-face families
    const fontLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => l.href)
      .filter(Boolean);

    return { url: location.href, styles, fontLinks: fontLinks.slice(0, 8) };
  });

  results[page.name] = data;
  await tab.screenshot({ path: `scripts/spacex-ref-${page.name}.png`, fullPage: false });
  await tab.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
