/**
 * Generate SVG logos for all 54 providers
 * Creates professional, minimal logos with brand colors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROVIDERS = [
  // Academic
  { id: 'openalex', name: 'OpenAlex', color: '#FF6B35' },
  { id: 'semanticscholar', name: 'Semantic Scholar', color: '#1857B6' },
  { id: 'crossref', name: 'Crossref', color: '#F68212' },
  { id: 'pubmed', name: 'PubMed', color: '#326295' },
  { id: 'arxiv', name: 'arXiv', color: '#B31B1B' },
  { id: 'hal', name: 'HAL', color: '#0063B1' },
  { id: 'thesesfr', name: 'theses.fr', color: '#000091' },
  { id: 'base', name: 'BASE', color: '#003366' },
  
  // Institutional - Economic
  { id: 'worldbank', name: 'World Bank', color: '#009FDA' },
  { id: 'imf', name: 'IMF', color: '#0071BC' },
  { id: 'oecd', name: 'OECD', color: '#003B71' },
  { id: 'bis', name: 'BIS', color: '#003D7A' },
  
  // Institutional - Defense & Intelligence
  { id: 'nato', name: 'NATO', color: '#003F87' },
  { id: 'odni', name: 'ODNI', color: '#1C3664' },
  { id: 'nsa', name: 'NSA', color: '#0A2240' },
  { id: 'sgdsn', name: 'SGDSN', color: '#000091' },
  { id: 'eeas', name: 'EEAS', color: '#003399' },
  
  // Institutional - Cyber
  { id: 'nist', name: 'NIST', color: '#112E51' },
  { id: 'cisa', name: 'CISA', color: '#0050D8' },
  { id: 'enisa', name: 'ENISA', color: '#003399' },
  
  // Institutional - Multilateral
  { id: 'un', name: 'United Nations', color: '#009EDB' },
  { id: 'undp', name: 'UNDP', color: '#0468B1' },
  { id: 'unctad', name: 'UNCTAD', color: '#0077B8' },
  
  // Think Tanks
  { id: 'brookings', name: 'Brookings', color: '#003A70' },
  { id: 'rand', name: 'RAND', color: '#00447C' },
  { id: 'cset', name: 'CSET', color: '#041E42' },
  { id: 'govai', name: 'GovAI', color: '#1E3A8A' },
  { id: 'cnas', name: 'CNAS', color: '#003D7A' },
  { id: 'newamerica', name: 'New America', color: '#E63946' },
  { id: 'ainow', name: 'AI Now Institute', color: '#6366F1' },
  { id: 'datasociety', name: 'Data & Society', color: '#8B5CF6' },
  { id: 'cdt', name: 'CDT', color: '#059669' },
  { id: 'iaps', name: 'IAPS', color: '#3B82F6' },
  { id: 'scsp', name: 'SCSP', color: '#1E40AF' },
  { id: 'rstreet', name: 'R Street', color: '#DC2626' },
  { id: 'lawzero', name: 'LawZero', color: '#7C3AED' },
  { id: 'caip', name: 'CAIP', color: '#2563EB' },
  { id: 'aipi', name: 'AIPI', color: '#4F46E5' },
  { id: 'caidp', name: 'CAIDP', color: '#6366F1' },
  { id: 'ifp', name: 'IFP', color: '#0891B2' },
  { id: 'abundance', name: 'Abundance', color: '#10B981' },
];

function generateSVG(provider) {
  const width = provider.name.length * 10 + 40;
  const height = 40;
  
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="${provider.color}" fill-opacity="0.1"/>
  <text x="${width/2}" y="${height/2 + 6}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="${provider.color}" text-anchor="middle">${provider.name}</text>
</svg>`;
}

const outputDir = path.join(__dirname, '..', 'public', 'providers');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate all logos
let generated = 0;
for (const provider of PROVIDERS) {
  const svg = generateSVG(provider);
  const filePath = path.join(outputDir, `${provider.id}.svg`);
  fs.writeFileSync(filePath, svg);
  generated++;
  console.log(`✅ Generated: ${provider.name} (${provider.id}.svg)`);
}

console.log(`\n🎨 Generated ${generated} provider logos in /public/providers/`);
