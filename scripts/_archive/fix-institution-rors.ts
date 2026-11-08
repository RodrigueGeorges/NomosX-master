/**
 * Codemod: fix wrong/outdated ROR IDs in institutional providers.
 *
 * A diagnostic revealed ~35 hardcoded ROR IDs return 0 works in OpenAlex.
 * This script resolves each institution's CORRECT ROR by name (via the OpenAlex
 * institutions endpoint, picking the highest works_count match) and replaces the
 * wrong ROR string in-place. Multi-ROR files are handled (each wrong ROR mapped).
 *
 * Usage: node --import tsx scripts/fix-institution-rors.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';

const mailto = process.env.UNPAYWALL_EMAIL || 'contact@nomosx.com';
const apiKey = process.env.OPENALEX_API_KEY;
const auth = apiKey ? `api_key=${encodeURIComponent(apiKey)}` : `mailto=${encodeURIComponent(mailto)}`;

// wrongRor → canonical institution name to resolve the correct ROR
const ROR_TO_NAME: Record<string, string> = {
  '01bmvkm47': 'EU Institute for Security Studies',
  '01qej4t75': 'European Defence Agency',
  '02az9a613': 'European Commission',
  '03hvn0x85': 'North Atlantic Treaty Organization',
  '01jbf4w46': 'RAND Corporation',
  '04p3j2v76': 'Institut Français des Relations Internationales',
  '03xez6b38': 'Sciences Po',
  '05a0dhs15': 'École Normale Supérieure - PSL',
  '04zmz0h21': 'École Normale Supérieure de Lyon',
  '01e9e2kw5': 'European Union Agency for Cybersecurity',
  '05xpvk416': 'National Institute of Standards and Technology',
  '02k7v4d05': 'European Investment Bank',
  '00h1hpe16': 'International Atomic Energy Agency',
  '030q6uf81': 'International Renewable Energy Agency',
  '04f7e0t38': "Agence de l'Environnement et de la Maîtrise de l'Énergie",
  '02s377d40': "Commissariat à l'énergie atomique et aux énergies alternatives",
  '02feahw73': 'Centre National de la Recherche Scientifique',
  '02wqz4q95': 'Institut du Développement Durable et des Relations Internationales',
  '02cjnvs63': 'Institut National de la Statistique et des Études Économiques',
  '03bp5hc32': 'Centers for Disease Control and Prevention',
  '0090npp15': 'Cochrane',
  '04mfmq790': 'European Centre for Disease Prevention and Control',
  '031bh4s32': 'European Medicines Agency',
  '02vjkv261': 'Institut National de la Santé et de la Recherche Médicale',
  '01k4yrm29': 'World Health Organization',
  '0304whf06': 'United Nations',
  '02szg9b20': 'United Nations Conference on Trade and Development',
  '01bhm6w13': 'United Nations Development Programme',
  '01mna5h14': 'Allen Institute for Artificial Intelligence',
  '05a28rw58': 'ETH Zurich',
  '02kvxyf05': 'Institut National de Recherche en Informatique et en Automatique',
  '01hhn8328': 'Max Planck Society',
  '03q12x978': 'European Council on Foreign Relations',
  '03fcxyy92': 'Istituto Affari Internazionali',
  '02bjzsh13': 'Stockholm International Peace Research Institute',
  '03b6thg82': 'Stiftung Wissenschaft und Politik',
  // Known-correct (verified >0 works) — kept for validation, not replaced if same
  '003vg9w96': 'Institut National de Recherche pour l’Agriculture, l’Alimentation et l’Environnement',
  '01cwqze88': 'National Institutes of Health',
};

async function resolveRor(name: string): Promise<{ ror: string | null; count: number; display: string | null }> {
  const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(name)}&per-page=5&${auth}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const results: any[] = data?.results || [];
    if (results.length === 0) return { ror: null, count: 0, display: null };
    const best = results.reduce((a, b) => (b.works_count > a.works_count ? b : a));
    const ror = best.ror ? String(best.ror).replace('https://ror.org/', '') : null;
    return { ror, count: best.works_count || 0, display: best.display_name || null };
  } catch (e: any) {
    console.warn(`  resolve failed for "${name}": ${e.message}`);
    return { ror: null, count: 0, display: null };
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

async function main() {
  console.log('Resolving correct RORs by institution name...\n');

  // Resolve all wrong RORs → correct RORs
  const corrections = new Map<string, string>(); // wrongRor → correctRor
  for (const [wrongRor, name] of Object.entries(ROR_TO_NAME)) {
    const { ror, count, display } = await resolveRor(name);
    if (ror && ror !== wrongRor && count > 0) {
      corrections.set(wrongRor, ror);
      console.log(`  ${wrongRor} → ${ror}  (${display}, ${count} works)`);
    } else if (ror === wrongRor) {
      console.log(`  ${wrongRor} OK (${display}, ${count} works)`);
    } else {
      console.log(`  ${wrongRor} UNRESOLVED (name="${name}", best=${ror}, count=${count})`);
    }
  }

  if (corrections.size === 0) {
    console.log('\nNo corrections needed.');
    return;
  }

  console.log(`\nApplying ${corrections.size} ROR corrections across institutional files...\n`);
  const files = walk(path.join(process.cwd(), 'lib', 'providers', 'institutional'));
  let filesChanged = 0;
  let replacements = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let changed = false;
    for (const [wrongRor, correctRor] of corrections) {
      if (content.includes(wrongRor)) {
        content = content.split(wrongRor).join(correctRor);
        changed = true;
        replacements++;
      }
    }
    if (changed) {
      fs.writeFileSync(file, content, 'utf-8');
      filesChanged++;
      console.log(`  patched: ${path.relative(process.cwd(), file)}`);
    }
  }

  console.log(`\nDone: ${replacements} replacements across ${filesChanged} files.`);
}

main().catch(e => { console.error(e); process.exit(1); });
