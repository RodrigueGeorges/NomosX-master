import { runNumericalGate } from '../lib/agent/style-gates';
import * as fs from 'fs';
const html = fs.readFileSync('scripts/output-strategic-latest.html', 'utf8');
const r = runNumericalGate(html, 30);
console.log('violations:', r.violations.length);
for (const v of r.violations.slice(0, 15)) console.log('-', JSON.stringify(v.match), '@', v.position);
