const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.findFirst({ where: { id: 'cmstb3q1h0b7n4jbpqev97g5q' }, select: { html: true } });
  if (!b) { console.log('NOT FOUND'); process.exit(1); }
  const h = b.html || '';
  // Count E-prefixed citations
  const ePrefix = h.match(/data-evidence="E\d+"/g) || [];
  const cleanEvidence = h.match(/data-evidence="\d+"/g) || [];
  console.log('Clean data-evidence:', cleanEvidence.length);
  console.log('E-prefixed data-evidence:', ePrefix.length);
  if (ePrefix.length > 0) console.log('Samples:', ePrefix.slice(0, 5).join(', '));

  // Check visible text E prefixes
  const visibleE = h.match(/>E\d+</g) || [];
  console.log('Visible E-prefixed:', visibleE.length);
  if (visibleE.length > 0) console.log('Samples:', visibleE.slice(0, 5).join(', '));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
