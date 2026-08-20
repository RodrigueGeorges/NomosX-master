/**
 * Extract the inline base64 hero image from the HTML and save it as a separate PNG file.
 * Then rewrite the <img src="data:..."> to point to the PNG URL.
 */
import fs from 'fs';

const htmlPath = 'scripts/output-funnel.html';
const pngPath = 'scripts/hero-image.png';

const html = fs.readFileSync(htmlPath, 'utf-8');

// Find the hero image base64
const imgRegex = /(<figure class="hero-image"[^>]*>\s*<img src=")(data:image\/png;base64,([^"]+))("[^>]*\/>\s*<\/figure>)/;
const match = html.match(imgRegex);

if (!match) {
  console.error('No inline PNG hero image found');
  process.exit(1);
}

const b64 = match[3];
const pngBuffer = Buffer.from(b64, 'base64');
fs.writeFileSync(pngPath, pngBuffer);
console.log(`✅ Saved PNG: ${pngPath} (${(pngBuffer.length / 1024).toFixed(0)}KB)`);

// Rewrite HTML to reference the PNG file via URL
const newHtml = html.replace(imgRegex, `$1${pngPath}$4`);
fs.writeFileSync(htmlPath, newHtml, 'utf-8');
console.log(`✅ Rewrote HTML to reference ${pngPath} (new size: ${newHtml.length} chars)`);
