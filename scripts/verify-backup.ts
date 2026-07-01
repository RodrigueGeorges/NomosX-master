import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'backup_pre_clean_slate');
const files = ['thinkTankPublication', 'conceptNode', 'agentAuditLog', 'brief', 'pipelineRun', 'conceptRelation'];

for (const f of files) {
  const fp = path.join(dir, `${f}.json`);
  const raw = fs.readFileSync(fp, 'utf8');
  const data = JSON.parse(raw);
  console.log(`${f}: ${data.length} records | first id=${data[0]?.id ?? 'n/a'} | last id=${data[data.length-1]?.id ?? 'n/a'} | size=${(raw.length/1024).toFixed(0)}KB`);
}
console.log('\n✅ Backup verified — all files readable, JSON valid.');
