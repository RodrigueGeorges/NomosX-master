/**
 * fetch-vdem.ts — one-time extract of the V-Dem Country-Year dataset.
 *
 * Downloads the official V-Dem CSV ZIP (~27MB compressed, ~400MB CSV),
 * keeps only the democracy/governance indices NomosX providers need, and
 * writes a compact JSON extract to data/vdem-extract.json.
 *
 * Usage: npx tsx scripts/fetch-vdem.ts
 * Re-run to refresh when V-Dem publishes a new release.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import extractZip from 'extract-zip';
import { parse } from 'fast-csv';

const ZIP_URL =
  'https://v-dem.net/media/datasets/V-Dem-CY-FullOthers_csv_v13.zip';
const CSV_NAME = 'V-Dem-CY-Full+Others-v13.csv';
const OUT = path.join(process.cwd(), 'data', 'vdem-extract.json');

// High-signal indices: 5 democracy pillars + autocracy/regime + civil
// liberties, corruption, gender, rule of law, elections + WB governance.
const VARIABLES: Record<string, string> = {
  v2x_polyarchy: 'Electoral democracy index (0-1)',
  v2x_libdem: 'Liberal democracy index (0-1)',
  v2x_partipdem: 'Participatory democracy index (0-1)',
  v2x_delibdem: 'Deliberative democracy index (0-1)',
  v2x_egaldem: 'Equalitarian democracy index (0-1)',
  v2x_api: 'Autocracy index (0-1, higher = more autocratic)',
  v2x_mpi: 'Municipal democracy index (0-1)',
  v2x_regime: 'Regime classification (0 closed … 3 liberal democracy)',
  v2x_civlib: 'Civil liberties index (0-1)',
  v2x_corr: 'Corruption index (0-1, higher = more corrupt)',
  v2x_gender: 'Gender equality index (0-1)',
  v2x_rule: 'Rule of law index (0-1)',
  v2x_elecreg: 'Election registry index (0-1)',
  v2x_hosabort: 'Head-of-state removes restrictions on executive (0-1)',
  v2x_freexp: 'Freedom of expression index (0-1)',
  v2x_frassoc_thick: 'Freedom of association (thick) index (0-1)',
  v2x_suffr: 'Suffrage index (0-1)',
  v2x_veracc: 'Vertical accountability index (0-1)',
  e_coups: 'Coups d\u2019état count',
  e_polity2: 'Polity2 democracy-autocracy score (-10…+10)',
  e_ti_cpi: 'Transparency International CPI (0-100)',
  e_wbgi_cce: 'WB Gov: Control of Corruption (percentile)',
  e_wbgi_gee: 'WB Gov: Government Effectiveness (percentile)',
  e_wbgi_pve: 'WB Gov: Political Stability (percentile)',
  e_wbgi_rle: 'WB Gov: Regulatory Quality (percentile)',
  e_wbgi_rqe: 'WB Gov: Rule of Law (percentile)',
  e_wbgi_vae: 'WB Gov: Voice & Accountability (percentile)',
};

const VAR_CODES = Object.keys(VARIABLES);
const KEEP = ['country_name', 'country_text_id', 'year', ...VAR_CODES];
const MIN_YEAR = 1945;

async function main() {
  const zipPath = path.join(os.tmpdir(), 'vdem-fullothers.zip');
  if (!fs.existsSync(zipPath)) {
    console.log('[vdem] downloading', ZIP_URL);
    const res = await fetch(ZIP_URL);
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buf);
    console.log('[vdem] zip saved', (buf.length / 1e6).toFixed(1), 'MB');
  }

  const tmp = os.tmpdir();
  let csvPath: string | null = null;
  for (const d of fs.readdirSync(tmp)) {
    if (!d.startsWith('vdem-')) continue;
    const cand = path.join(tmp, d, CSV_NAME);
    if (fs.existsSync(cand) && fs.statSync(cand).size > 3e8) {
      csvPath = cand;
      break;
    }
  }
  let tmpDir: string | null = null;
  if (!csvPath) {
    tmpDir = fs.mkdtempSync(path.join(tmp, 'vdem-'));
    await extractZip(zipPath, { dir: tmpDir });
    csvPath = path.join(tmpDir, CSV_NAME);
  }
  console.log('[vdem] csv ready:', csvPath);

  const rows: Array<Array<string | number | null>> = [];
  let kept = 0;
  let skipped = 0;
  const stream = fs.createReadStream(csvPath).pipe(
    parse({ headers: true, ignoreEmpty: true, relax_quotes: true }),
  );
  for await (const rec of stream as any) {
    const year = Number(rec.year);
    if (!Number.isFinite(year) || year < MIN_YEAR) {
      skipped++;
      continue;
    }
    const row: Array<string | number | null> = [
      rec.country_name ?? '',
      rec.country_text_id ?? '',
      year,
    ];
    let any = false;
    for (const code of VAR_CODES) {
      const raw = rec[code];
      const v = raw === '' || raw == null ? null : Number(raw);
      row.push(v != null && Number.isFinite(v) ? v : null);
      if (v != null && Number.isFinite(v)) any = true;
    }
    if (!any) {
      skipped++;
      continue;
    }
    rows.push(row);
    kept++;
  }

  const out = {
    version: 'v13',
    source: ZIP_URL,
    generatedAt: new Date().toISOString(),
    minYear: MIN_YEAR,
    columns: ['country_name', 'country_text_id', 'year', ...VAR_CODES],
    variables: VARIABLES,
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(
    `[vdem] wrote ${OUT} — ${kept} rows kept, ${skipped} skipped, ` +
      `${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`,
  );
}

main().catch((e) => {
  console.error('[vdem] failed:', e);
  process.exit(1);
});
