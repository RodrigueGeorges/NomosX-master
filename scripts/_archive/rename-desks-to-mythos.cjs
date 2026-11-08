/**
 * Rename the 22 Council desk identities from abstract Greek concepts
 * to their patron mythological figures (fresco-DA personification).
 *
 * Handles collisions:
 *  - council law "Dr. Nomos" -> "Dr. Themis"; sub-lens legal-theory
 *    "Dr. Themis" -> "Dr. Nomos" (swap via placeholders)
 *  - council economics -> "Dr. Ploutos"; sub-lens political-economy
 *    "Dr. Ploutos" -> "Dr. Oikonomia" (freed name cascades down)
 *  - council policy -> "Dr. Eunomia" (good order — governance)
 *
 * Health (Hygeia) and Environment (Gaia) keep their names — already divine.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// [old canonical name, new canonical name]
const RENAMES = [
  ['Dr. Oikonomia (Οἰκονομία)', 'Dr. Ploutos (Πλοῦτος)'],
  ['Dr. Techne (Τέχνη)', 'Dr. Hephaestus (Ἥφαιστος)'],
  ['Dr. Politeia (Πολιτεία)', 'Dr. Eunomia (Εὐνομία)'],
  ['Dr. Aegis (Αἰγίς)', 'Dr. Athena (Ἀθηνᾶ)'],
  ['Dr. Metron (Μέτρον)', 'Dr. Lachesis (Λάχεσις)'],
  ['Dr. Chrematistikos (Χρηματιστικός)', 'Dr. Hermes (Ἑρμῆς)'],
  ['Dr. Koinonia (Κοινωνία)', 'Dr. Hestia (Ἑστία)'],
  ['Dr. Logos (Λόγος)', 'Dr. Apollo (Ἀπόλλων)'],
  ['Dr. Energeia (Ἐνέργεια)', 'Dr. Helios (Ἥλιος)'],
  ['Dr. Polis (Πόλις)', 'Dr. Atlas (Ἄτλας)'],
  ['Dr. Noesis (Νόησις)', 'Dr. Metis (Μῆτις)'],
  ['Dr. Digi (Δίγι)', 'Dr. Iris (Ἶρις)'],
  ['Dr. Thymos (Θυμός)', 'Dr. Dionysus (Διόνυσος)'],
  ['Dr. Asty (Ἄστυ)', 'Dr. Daedalus (Δαίδαλος)'],
  ['Dr. Auxesis (Αὔξησις)', 'Dr. Demeter (Δημήτηρ)'],
  ['Dr. Syntaxis (Σύνταξις)', 'Dr. Arachne (Ἀράχνη)'],
  ['Dr. Bios (Βίος)', 'Dr. Asclepius (Ἀσκληπιός)'],
  ['Dr. Chaos (Χάος)', 'Dr. Proteus (Πρωτεύς)'],
  ['Dr. Kyvernon (Κύβερνον)', 'Dr. Cassandra (Κασσάνδρα)'],
];

const FILES = [
  'lib/researchers.ts',
  'lib/agent/phd-researcher.ts',
  'lib/agent/researcher-kb/index.ts',
  'lib/agent/researcher-ownership.ts',
  'lib/agent/domain-expert.ts',
  'lib/agent/realtime-data-hub.ts',
  'lib/agent/agent-memory.ts',
  'lib/agent/researcher-identity.ts',
  'scripts/unify-desks.cjs',
  'scripts/deploy-unified-system.js',
  'scripts/test-complete-architecture.js',
];

// New Greek monograms per council desk (first letter of the new name, doubled)
const INITIALS = {
  economics: 'ΠΠ', technology: 'ΗΗ', policy: 'ΕΕ', security: 'ΑΑ',
  law: 'ΘΘ', quantitative: 'ΛΛ', finance: 'ΕΕ', 'social-sciences': 'ΕΕ',
  humanities: 'ΑΑ', 'energy-advanced': 'ΗΗ', geopolitics: 'ΑΑ',
  'cognitive-science': 'ΜΜ', 'digital-society': 'ΙΙ',
  'behavioral-economics': 'ΔΔ', 'urban-studies': 'ΔΔ',
  'development-economics': 'ΔΔ', 'computational-social-science': 'ΑΑ',
  bioethics: 'ΑΑ', 'complexity-science': 'ΠΠ', 'risk-analysis': 'ΚΚ',
};

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log('skip (missing):', rel); continue; }
  let src = fs.readFileSync(file, 'utf8');
  let n = 0;

  // 1) Protect colliding sub-lens entries with placeholders
  src = src.replace('"political-economy": "Dr. Ploutos (Πλοῦτος)"', '"political-economy": "@@POLITECON@@"');
  src = src.replace('"legal-theory": "Dr. Themis (Θέμις)"', '"legal-theory": "@@LEGALTHEORY@@"');

  // 2) Swap target first: sub-lens legal-theory freed "Nomos" while law takes "Themis"
  //    (handled via placeholder above — now replace law's Nomos globally)
  const before = src;
  src = src.split('Dr. Nomos (Νόμος)').join('Dr. Themis (Θέμις)');
  if (src !== before) n++;

  // 3) All other renames
  for (const [from, to] of RENAMES) {
    if (src.includes(from)) { src = src.split(from).join(to); n++; }
  }

  // 4) Resolve placeholders
  src = src.split('@@POLITECON@@').join('Dr. Oikonomia (Οἰκονομία)');
  src = src.split('@@LEGALTHEORY@@').join('Dr. Nomos (Νόμος)');

  // 5) Update council initials in researchers.ts
  if (rel === 'lib/researchers.ts') {
    for (const [id, mono] of Object.entries(INITIALS)) {
      const re = new RegExp(`(id: "${id}"[\\s\\S]*?initials: ")[^"]*(")`);
      const prev = src;
      src = src.replace(re, `$1${mono}$2`);
      if (src === prev) console.warn(`  !! initials not updated for ${id}`);
    }
  }

  fs.writeFileSync(file, src, 'utf8');
  console.log(`updated ${rel} (${n} name groups)`);
}
console.log('done');
