/**
 * unify-desks.cjs — one-off migration (identity unification)
 *
 * Replaces fabricated human researcher names + real-institution credentials
 * with the canonical NomosX desk identities (Greek canon):
 *   - Council domains  -> names from lib/researchers.ts (RESEARCHERS)
 *   - Sub-lens domains -> SUB_LENS_IDENTITIES
 *
 * Rewrites:
 *   lib/researchers.ts              institution -> "NomosX Institute", drop hIndex/publications/citationCount
 *   lib/agent/phd-researcher.ts     EXPERT_PERSONAS name + first credential sentence
 *   lib/agent/domain-expert.ts      DOMAIN_EXPERTS name
 *   lib/agent/researcher-ownership.ts RESEARCHER_REGISTRY name + institution
 *   lib/agent/researcher-kb/index.ts  researcherName
 *
 * Usage: node scripts/unify-desks.cjs [--apply]
 */
const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const root = path.join(__dirname, '..');

// --- desk names (mirror of lib/researchers.ts SUB_LENS_IDENTITIES) ---
const COUNCIL = {
  economics: 'Dr. Ploutos (Πλοῦτος)',
  technology: 'Dr. Hephaestus (Ἥφαιστος)',
  policy: 'Dr. Eunomia (Εὐνομία)',
  health: 'Dr. Hygeia (Ὑγίεια)',
  security: 'Dr. Athena (Ἀθηνᾶ)',
  law: 'Dr. Themis (Θέμις)',
  environment: 'Dr. Gaia (Γαία)',
  quantitative: 'Dr. Lachesis (Λάχεσις)',
  finance: 'Dr. Hermes (Ἑρμῆς)',
  'social-sciences': 'Dr. Hestia (Ἑστία)',
  humanities: 'Dr. Apollo (Ἀπόλλων)',
  'energy-advanced': 'Dr. Helios (Ἥλιος)',
  geopolitics: 'Dr. Atlas (Ἄτλας)',
  'cognitive-science': 'Dr. Metis (Μῆτις)',
  'digital-society': 'Dr. Iris (Ἶρις)',
  'behavioral-economics': 'Dr. Dionysus (Διόνυσος)',
  'urban-studies': 'Dr. Daedalus (Δαίδαλος)',
  'development-economics': 'Dr. Demeter (Δημήτηρ)',
  'computational-social-science': 'Dr. Arachne (Ἀράχνη)',
  bioethics: 'Dr. Asclepius (Ἀσκληπιός)',
  'complexity-science': 'Dr. Proteus (Πρωτεύς)',
  'risk-analysis': 'Dr. Cassandra (Κασσάνδρα)',
};
const SUB_LENS = {
  anthropology: 'Dr. Anthropos (Ἄνθρωπος)',
  history: 'Dr. Historia (Ἱστορία)',
  'religious-studies': 'Dr. Threskeia (Θρησκεία)',
  'non-western-philosophy': 'Dr. Gnosis (Γνῶσις)',
  sociology: 'Dr. Demos (Δῆμος)',
  psychology: 'Dr. Psyche (Ψυχή)',
  'political-science': 'Dr. Kratos (Κράτος)',
  demography: 'Dr. Plethysmos (Πληθυσμός)',
  criminology: 'Dr. Dike (Δίκη)',
  education: 'Dr. Paideia (Παιδεία)',
  philosophy: 'Dr. Sophia (Σοφία)',
  linguistics: 'Dr. Glossa (Γλῶσσα)',
  'media-studies': 'Dr. Angelia (Ἀγγελία)',
  epidemiology: 'Dr. Nosos (Νόσος)',
  'public-health': 'Dr. Prophylaxis (Προφύλαξις)',
  'international-relations': 'Dr. Oikumene (Οἰκουμένη)',
  'migration-studies': 'Dr. Metanastes (Μετανάστης)',
  'science-technology-studies': 'Dr. Mechanē (Μηχανή)',
  epistemology: 'Dr. Episteme (Ἐπιστήμη)',
  'international-law': 'Dr. Dikaion (Δίκαιον)',
  'conflict-studies': 'Dr. Polemos (Πόλεμος)',
  'political-economy': 'Dr. Ploutos (Πλοῦτος)',
  'public-administration': 'Dr. Diokesis (Διοίκησις)',
  'gender-studies': 'Dr. Isotes (Ἰσότης)',
  'area-studies': 'Dr. Chora (Χώρα)',
  'labor-studies': 'Dr. Ergon (Ἔργον)',
  'ethics-of-technology': 'Dr. Arete (Ἀρετή)',
  archaeology: 'Dr. Archaia (Ἀρχαία)',
  neuroscience: 'Dr. Enkephalos (Ἐγκέφαλος)',
  'data-science': 'Dr. Dedomena (Δεδομένα)',
  'economic-history': 'Dr. Mnemosyne (Μνημοσύνη)',
  'social-psychology': 'Dr. Homilia (Ὁμιλία)',
  'organizational-studies': 'Dr. Taxis (Τάξις)',
  'science-policy': 'Dr. Prometheus (Προμηθεύς)',
  'development-studies': 'Dr. Anaptyxis (Ἀνάπτυξις)',
  'comparative-politics': 'Dr. Synkrisis (Σύγκρισις)',
  'social-theory': 'Dr. Praxis (Πρᾶξις)',
  'philosophy-of-science': 'Dr. Theoria (Θεωρία)',
  'law-and-economics': 'Dr. Nomisma (Νόμισμα)',
  'intelligence-studies': 'Dr. Phronesis (Φρόνησις)',
  'military-studies': 'Dr. Ares (Ἄρης)',
  'futures-studies': 'Dr. Mellon (Μέλλον)',
  'economic-sociology': 'Dr. Agora (Ἀγορά)',
  'historical-sociology': 'Dr. Chronos (Χρόνος)',
  'environmental-economics': 'Dr. Oikos (Οἶκος)',
  'health-economics': 'Dr. Therapeia (Θεραπεία)',
  'legal-theory': 'Dr. Themis (Θέμις)',
  'postcolonial-studies': 'Dr. Eleutheria (Ἐλευθερία)',
  'communication-studies': 'Dr. Rhema (Ῥῆμα)',
  'public-finance': 'Dr. Tamias (Ταμίας)',
  'political-anthropology': 'Dr. Ethnos (Ἔθνος)',
  'food-systems': 'Dr. Sitos (Σῖτος)',
};
const DESK = { ...COUNCIL, ...SUB_LENS };
const INSTITUTE = 'NomosX Institute';

function splitTopLevelBlocks(src, objStartIdx) {
  // Entries at indent 2: `  domain: {` or `  "domain": {`
  const endIdx = src.indexOf('\n};', objStartIdx);
  const body = src.slice(objStartIdx, endIdx);
  const re = /^ {2}["']?([a-z-]+)["']?: \{/gm;
  const keys = [];
  let m;
  while ((m = re.exec(body))) keys.push({ domain: m[1], start: m.index });
  return keys.map((k, i) => ({
    domain: k.domain,
    start: objStartIdx + k.start,
    end: objStartIdx + (i + 1 < keys.length ? keys[i + 1].start : body.length),
  }));
}

const report = [];

// ============================ phd-researcher.ts ============================
(function () {
  const file = path.join(root, 'lib/agent/phd-researcher.ts');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('const EXPERT_PERSONAS');
  const blocks = splitTopLevelBlocks(src, src.indexOf('{', start));
  // work backwards so indices stay valid
  for (const b of blocks.slice().reverse()) {
    const name = DESK[b.domain];
    if (!name) { report.push(`phd-researcher: NO DESK NAME for ${b.domain}`); continue; }
    let blk = src.slice(b.start, b.end);
    const nm = blk.match(/name:\s*"Dr\. [^"]+? — ([^"]+)"/);
    const tail = nm ? nm[1] : null;
    let changed = 0;
    blk = blk.replace(/name:\s*"Dr\. [^"]+"/, () => { changed++; return `name: "${name}${tail ? ' — ' + tail : ''}"`; });
    blk = blk.replace(/systemPrompt: `You are Dr\. [^,]+, [^.`\n]+\./, () => {
      changed++;
      return `systemPrompt: \`You are ${name}, the ${tail ?? b.domain} desk of NomosX — an autonomous research institute.`;
    });
    src = src.slice(0, b.start) + blk + src.slice(b.end);
    report.push(`phd-researcher ${b.domain}: ${changed} edits -> ${name}`);
  }
  src = src.replace('EXPERT PERSONAS — Harvard-level domain specialists', 'EXPERT PERSONAS — NomosX desk identities, PhD-level domain specialists');
  if (APPLY) fs.writeFileSync(file, src);
})();

// ============================ domain-expert.ts ============================
(function () {
  const file = path.join(root, 'lib/agent/domain-expert.ts');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('export const DOMAIN_EXPERTS');
  const blocks = splitTopLevelBlocks(src, src.indexOf('{', start));
  for (const b of blocks.slice().reverse()) {
    const name = DESK[b.domain];
    if (!name) { report.push(`domain-expert: NO DESK NAME for ${b.domain}`); continue; }
    let blk = src.slice(b.start, b.end);
    let changed = 0;
    blk = blk.replace(/name:\s*'Dr\. [^']+'/, () => { changed++; return `name: '${name}'`; });
    src = src.slice(0, b.start) + blk + src.slice(b.end);
    report.push(`domain-expert ${b.domain}: ${changed} edits`);
  }
  if (APPLY) fs.writeFileSync(file, src);
})();

// ============================ researcher-ownership.ts ============================
(function () {
  const file = path.join(root, 'lib/agent/researcher-ownership.ts');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('export const RESEARCHER_REGISTRY');
  const blocks = splitTopLevelBlocks(src, src.indexOf('{', start));
  for (const b of blocks.slice().reverse()) {
    const name = DESK[b.domain];
    if (!name) { report.push(`ownership: NO DESK NAME for ${b.domain}`); continue; }
    let blk = src.slice(b.start, b.end);
    let changed = 0;
    blk = blk.replace(/name:\s*"Dr\. [^"]+"/, () => { changed++; return `name: "${name}"`; });
    blk = blk.replace(/institution:\s*"[^"]+"/, () => { changed++; return `institution: "${INSTITUTE}"`; });
    src = src.slice(0, b.start) + blk + src.slice(b.end);
    report.push(`ownership ${b.domain}: ${changed} edits`);
  }
  // getResearcherUIName should resolve sub-lens names too
  src = src.replace(
    /export function getResearcherUIName\(domain: DomainExpertise\): string \{\s*\n\s*return getResearcher\(domain\)\?\.name \?\? domain;/,
    'export function getResearcherUIName(domain: DomainExpertise): string {\n  return getDeskName(domain);'
  );
  src = src.replace(
    /export function getResearcherUIInstitution\(domain: DomainExpertise\): string \{\s*\n\s*return getResearcher\(domain\)\?\.institution \?\? '';/,
    `export function getResearcherUIInstitution(domain: DomainExpertise): string {\n  return getResearcher(domain)?.institution ?? '${INSTITUTE}';`
  );
  src = src.replace(
    "import { getResearcher } from '../researchers';",
    "import { getResearcher, getDeskName } from '../researchers';"
  );
  if (APPLY) fs.writeFileSync(file, src);
})();

// ============================ researcher-kb/index.ts ============================
(function () {
  const file = path.join(root, 'lib/agent/researcher-kb/index.ts');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('export const RESEARCHER_KBS');
  const blocks = splitTopLevelBlocks(src, src.indexOf('{', start));
  for (const b of blocks.slice().reverse()) {
    const name = DESK[b.domain];
    if (!name) { report.push(`researcher-kb: NO DESK NAME for ${b.domain}`); continue; }
    let blk = src.slice(b.start, b.end);
    let changed = 0;
    blk = blk.replace(/researcherName:\s*'Dr\. [^']+'/, () => { changed++; return `researcherName: '${name}'`; });
    src = src.slice(0, b.start) + blk + src.slice(b.end);
    report.push(`researcher-kb ${b.domain}: ${changed} edits`);
  }
  if (APPLY) fs.writeFileSync(file, src);
})();

// ============================ researchers.ts ============================
(function () {
  const file = path.join(root, 'lib/researchers.ts');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('export const RESEARCHERS');
  const end = src.indexOf('\n];', start);
  let body = src.slice(start, end);
  const before = body;
  body = body.replace(/institution:\s*"[^"]+",/g, `institution: "${INSTITUTE}",`);
  body = body.replace(/^\s+hIndex:\s*\d+,\n/gm, '');
  body = body.replace(/^\s+publications:\s*\d+,\n/gm, '');
  body = body.replace(/^\s+citationCount:\s*\d+,\n/gm, '');
  report.push(`researchers.ts: ${(before.match(/institution:/g) || []).length} institutions scrubbed, fabricated metrics removed`);
  src = src.slice(0, start) + body + src.slice(end);
  if (APPLY) fs.writeFileSync(file, src);
})();

console.log(report.join('\n'));
console.log(APPLY ? '\nAPPLIED.' : '\nDRY RUN — pass --apply to write.');
