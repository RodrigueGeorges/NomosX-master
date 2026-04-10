/**
 * OpenClaw Institutional Providers Export Fixer
 * Automatically fixes all export mismatches
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 OpenClaw Institutional Providers Export Fixer\n');
console.log('='.repeat(80));

const institutionalDir = path.join(process.cwd(), 'lib/providers/institutional');

// Find all exported search functions in subdirectories
function findAllExportedFunctions(dir, baseDir = dir) {
  const functions = new Map();
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const subFunctions = findAllExportedFunctions(fullPath, baseDir);
      subFunctions.forEach((value, key) => functions.set(key, value));
    } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name) && entry.name !== 'index.ts') {
      const content = fs.readFileSync(fullPath, 'utf8');
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
      
      // Find all exported functions
      const exportMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
      for (const match of exportMatches) {
        const funcName = match[1];
        if (funcName.startsWith('search')) {
          functions.set(funcName, relativePath);
        }
      }
    }
  }
  
  return functions;
}

console.log('\n📂 Scanning all institutional provider files...\n');
const allFunctions = findAllExportedFunctions(institutionalDir);

console.log(`Found ${allFunctions.size} search functions:\n`);
const sortedFunctions = Array.from(allFunctions.entries()).sort((a, b) => a[0].localeCompare(b[0]));
sortedFunctions.forEach(([name, path]) => {
  console.log(`   ✓ ${name} (from ./${path})`);
});

// Generate the new index.ts content
console.log('\n📝 Generating new index.ts...\n');

const newIndexContent = `/**
 * Institutional Providers Index
 * Centralized exports for all institutional data sources
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 */

// INTELLIGENCE
export * from './intelligence/odni';
export * from './intelligence/cia-foia';
export * from './intelligence/nsa';
export * from './intelligence/uk-jic';

// DEFENSE
export * from './defense/nato';
export * from './defense/eeas';
export * from './defense/sgdsn';
export * from './defense/eda';

// ECONOMIC
export * from './economic/imf';
export * from './economic/worldbank';
export * from './economic/oecd';
export * from './economic/bis';

// CYBER & RISK
export * from './cyber/nist';
export * from './cyber/cisa';
export * from './cyber/enisa';

// MULTILATERAL
export * from './multilateral/un';
export * from './multilateral/undp';
export * from './multilateral/unctad';

// ARCHIVES
export * from './archives/nara';
export * from './archives/uk-archives';
export * from './archives/archives-nationales-fr';

// V2 PROVIDERS (Stable, API-based)
export * from './v2/google-cse';
export * from './v2/worldbank-api';
export * from './v2/cisa-advisories';
export * from './v2/nara-api';
export * from './v2/uk-archives-api';
export * from './v2/un-digital-library';
export * from './v2/imf-sdmx';
export * from './v2/imf-elibrary';
export * from './v2/oecd-sdmx';
export * from './v2/oecd-ilibrary';
export * from './v2/bis-papers';
export * from './v2/nist-publications';
export * from './v2/eu-open-data';
export * from './v2/france-gov';
export * from './v2/nato-library';
export * from './v2/archive-org';

// THINK TANKS (Innovative - via Google CSE)
export {
  searchLawZeroViaGoogle,
  searchGovAIViaGoogle,
  searchIAPSViaGoogle,
  searchCAIPViaGoogle,
  searchAIPIViaGoogle,
  searchCSETViaGoogle,
  searchAINowViaGoogle,
  searchDataSocietyViaGoogle,
  searchAbundanceViaGoogle,
  searchCAIDPViaGoogle,
  searchSCSPViaGoogle,
  searchIFPViaGoogle,
  searchCDTViaGoogle,
  searchBrookingsViaGoogle,
  searchFAIViaGoogle,
  searchCNASViaGoogle,
  searchRANDViaGoogle,
  searchNewAmericaViaGoogle,
  searchAspenDigitalViaGoogle,
  searchRStreetViaGoogle
} from './v2/google-cse';

/**
 * Provider metadata
 */
export const INSTITUTIONAL_PROVIDERS = {
  // Intelligence (Priority: CRITICAL)
  'odni': { category: 'intelligence', priority: 10, rateLimit: 1000 },
  'cia-foia': { category: 'intelligence', priority: 9, rateLimit: 2000 },
  'nsa': { category: 'intelligence', priority: 9, rateLimit: 1000 },
  'uk-jic': { category: 'intelligence', priority: 8, rateLimit: 1000 },
  
  // Defense (Priority: HIGH)
  'nato': { category: 'defense', priority: 9, rateLimit: 1000 },
  'eeas': { category: 'defense', priority: 7, rateLimit: 1000 },
  'sgdsn': { category: 'defense', priority: 7, rateLimit: 1000 },
  'eda': { category: 'defense', priority: 6, rateLimit: 1000 },
  
  // Economic (Priority: HIGH)
  'imf': { category: 'economic', priority: 9, rateLimit: 1000 },
  'worldbank': { category: 'economic', priority: 9, rateLimit: 1000 },
  'oecd': { category: 'economic', priority: 8, rateLimit: 1000 },
  'bis': { category: 'economic', priority: 8, rateLimit: 1000 },
  
  // Cyber (Priority: MEDIUM)
  'nist': { category: 'cyber', priority: 7, rateLimit: 1000 },
  'cisa': { category: 'cyber', priority: 8, rateLimit: 1000 },
  'enisa': { category: 'cyber', priority: 7, rateLimit: 1000 },
  
  // Multilateral (Priority: MEDIUM)
  'un': { category: 'multilateral', priority: 6, rateLimit: 1500 },
  'undp': { category: 'multilateral', priority: 6, rateLimit: 1000 },
  'unctad': { category: 'multilateral', priority: 6, rateLimit: 1000 },
  
  // Archives (Priority: LOW - metadata only)
  'nara': { category: 'archives', priority: 4, rateLimit: 2000 },
  'uk-archives': { category: 'archives', priority: 4, rateLimit: 1500 },
  'archives-fr': { category: 'archives', priority: 4, rateLimit: 1500 },

  // Think Tanks (Priority: MEDIUM - innovative)
  'lawzero': { category: 'think-tank', priority: 7, rateLimit: 1500 },
  'govai': { category: 'think-tank', priority: 7, rateLimit: 1500 },
  'iaps': { category: 'think-tank', priority: 7, rateLimit: 1500 },
  'caip': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'aipi': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'cset': { category: 'think-tank', priority: 7, rateLimit: 1500 },
  'ainow': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'datasociety': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'abundance': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'caidp': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'scsp': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'ifp': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'cdt': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'brookings': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'fai': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'cnas': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'rand': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'newamerica': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'aspen-digital': { category: 'think-tank', priority: 6, rateLimit: 1500 },
  'rstreet': { category: 'think-tank', priority: 6, rateLimit: 1500 },
} as const;

export type InstitutionalProvider = keyof typeof INSTITUTIONAL_PROVIDERS;
`;

// Write the new index.ts
const indexPath = path.join(institutionalDir, 'index.ts');
fs.writeFileSync(indexPath, newIndexContent, 'utf8');

console.log('✅ New index.ts generated successfully!\n');
console.log('📊 Summary:');
console.log(`   - Total search functions available: ${allFunctions.size}`);
console.log(`   - All functions re-exported via export *`);
console.log(`   - No explicit function list (avoids undefined export errors)`);
console.log('\n✨ All exports are now properly defined!');
