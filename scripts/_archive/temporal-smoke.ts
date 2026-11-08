import { getTemporalClient } from '../lib/temporal/client';

async function main() {
  const client = await getTemporalClient();
  const workflowId = `smoke-${Date.now()}`;
  const r = await client.startCycle({ mode: 'breaking', maxPublications: 1, budgetUsd: 0.5, dryRun: true }, workflowId);
  console.log('STARTED:', JSON.stringify(r));
  const { Connection, Client } = await import('@temporalio/client');
  const conn = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS!, tls: true, apiKey: process.env.TEMPORAL_API_KEY!,
  });
  const c = new Client({ connection: conn, namespace: process.env.TEMPORAL_NAMESPACE });
  const handle = c.workflow.getHandle(workflowId);
  const result = await handle.result();
  console.log('RESULT:', JSON.stringify(result));
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e); process.exit(1); });
