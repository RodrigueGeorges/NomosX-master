// Calibration of the devil's advocate against already-published notes.
// Usage: tsx --env-file=.env.local scripts/calibrate-devils-advocate.ts [nPublished] [nHeld]
import { config } from 'dotenv';
config({ path: '.env.local' });

const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function main() {
  const nPub = Number(process.argv[2] ?? 12), nHeld = Number(process.argv[3] ?? 4);
  const { prisma } = await import('../lib/db');
  const { runDevilsAdvocate } = await import('../lib/agent/devils-advocate');
  const sel = { id: true, title: true, html: true, wordCount: true, trustScore: true, qualityScore: true, sourceIds: true, status: true, createdAt: true } as const;
  const pubs = [
    ...(await prisma.thinkTankPublication.findMany({ where: { status: 'PUBLISHED' }, select: sel, orderBy: { qualityScore: 'desc' }, take: nPub })),
    ...(await prisma.thinkTankPublication.findMany({ where: { status: 'HELD' }, select: sel, orderBy: { createdAt: 'desc' }, take: nHeld })),
  ];
  const out: Array<Record<string, unknown>> = [];
  let cost = 0;
  const work = async (p: (typeof pubs)[number]) => {
    try {
      const sources = await prisma.source.findMany({ where: { id: { in: p.sourceIds.slice(0, 40) } }, select: { title: true, provider: true, year: true, abstract: true } });
      const text = strip(p.html);
      const r = await runDevilsAdvocate(p.title, text, sources.map(s => ({ title: s.title, provider: s.provider, year: s.year ?? undefined, abstract: s.abstract ?? undefined })), { mode: 'brief' });
      cost += r.costUsd ?? 0;
      out.push({ status: p.status, date: p.createdAt.toISOString().slice(0, 10), words: p.wordCount, trust: p.trustScore, quality: p.qualityScore, verdict: r.verdict, publishability: r.publishabilityScore, strength: r.overallStrength, fatal: r.fatalChallenges.length, major: r.majorChallenges.length, types: [...r.fatalChallenges, ...r.majorChallenges].map(c => c.challengeType).slice(0, 6).join(','), kill: String(r.killShot ?? '').slice(0, 160), title: p.title.slice(0, 50) });
    } catch (e) { out.push({ status: p.status, title: p.title.slice(0, 50), error: String(e instanceof Error ? e.message : e).slice(0, 120) }); }
  };
  const queue = [...pubs];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let p = queue.shift(); p; p = queue.shift()) await work(p); }));
  out.sort((a, b) => String(a.status).localeCompare(String(b.status)) || Number(b.publishability ?? 0) - Number(a.publishability ?? 0));
  for (const o of out) console.log('CAL', JSON.stringify(o));
  const med = (a: number[]) => { const x = [...a].sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : NaN; };
  for (const st of ['PUBLISHED', 'HELD']) {
    const s = out.filter(o => o.status === st && typeof o.publishability === 'number').map(o => Number(o.publishability));
    console.log(`SUMMARY ${st} n=${s.length} median=${med(s)} min=${Math.min(...s)} max=${Math.max(...s)} pass>=40: ${s.filter(x => x >= 40).length}`);
  }
  console.log('COST$', cost.toFixed(3));
  await prisma.$disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
