const fs = require('fs'), path = require('path');
const roots = ['lib', 'app', 'components', 'scripts', '__tests__', '.'];
// root-level entry files (instrumentation.ts, next.config, middleware, sentry configs) count as importers

const skipDir = /node_modules|\.next/;
const files = [];
const walk = d => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!skipDir.test(p)) walk(p); }
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(f) && !/\.d\.ts$/.test(p)) files.push(p.replace(/\\/g, '/'));
  }
};
roots.forEach(r => {
  if (r === '.') {
    for (const f of fs.readdirSync('.')) {
      if (/\.(ts|tsx|mjs|js|cjs)$/.test(f) && !/\.d\.ts$/.test(f) && !fs.statSync(f).isDirectory()) files.push(f);
    }
  } else { try { walk(r); } catch (e) { } }
});
const contents = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const orphans = [];
for (const f of files) {
  if (/^scripts\//.test(f)) continue;         // standalone entry points
  if (/^app\//.test(f)) continue;             // Next.js conventions
  if (/__tests__|\.test\./.test(f)) continue; // tests aren't checked for orphan-hood
  const base = path.basename(f).replace(/\.(ts|tsx|mjs|js|cjs)$/, '');
  if (['index', 'route', 'page', 'layout', 'loading', 'error', 'middleware', 'globals'].includes(base)) continue;
  const needle = new RegExp(`['"](\\.\\.?/|@/|/)[^'"]*${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.(ts|tsx|mjs|js|cjs))?['"]`);
  const imported = [...contents.entries()].some(([o, c]) => o !== f && needle.test(c));
  if (!imported) orphans.push(f);
}
console.log(orphans.join('\n'));
console.log('ORPHANS:' + orphans.length);
