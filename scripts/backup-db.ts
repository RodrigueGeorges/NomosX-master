import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const { prisma } = await import('../lib/db');
  const backupDir = path.join(process.cwd(), 'backup_pre_clean_slate');
  fs.mkdirSync(backupDir, { recursive: true });

  const tables = [
    'thinkTankPublication',
    'thinkTankClaim',
    'thinkTankEvidenceSpan',
    'thinkTankPublicationRun',
    'thinkTankQualityCheck',
    'foresightRun',
    'brief',
    'draft',
    'conceptNode',
    'conceptRelation',
    'agentAuditLog',
    'pipelineRun',
    'signal',
    'vertical',
  ];

  const summary: Record<string, number> = {};
  for (const table of tables) {
    try {
      const records = await (prisma as any)[table].findMany();
      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
      summary[table] = records.length;
      console.log(`  ✅ ${table}: ${records.length} records → ${filePath}`);
    } catch (err) {
      console.log(`  ⚠️  ${table}: ${(err as Error).message}`);
      summary[table] = -1;
    }
  }

  // Write summary
  fs.writeFileSync(
    path.join(backupDir, '_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log(`\nBackup complete in ${backupDir}/`);
  console.log('Summary:', JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
