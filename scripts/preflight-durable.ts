import { initDurableRun, saveDurableStep, durableResume, markDurableComplete } from '../lib/agent/durable-execution';
(async () => {
  const key = `durable:preflight:${Date.now()}`;
  await initDurableRun(key, 'preflight-verification');
  const big = 'x'.repeat(1024 * 1024); // 1MB → blob path (>512KB threshold)
  await saveDurableStep(key, 'preflight:blob', { blob: big });
  const hit = await durableResume<{ blob: string }>(key, 'preflight:blob');
  console.log('BLOB-ROUNDTRIP:', hit && hit.blob.length === big.length ? 'PAYLOAD-OK' : 'MISMATCH/MISS');
  const small = { ids: [1, 2, 3] };
  await saveDurableStep(key, 'preflight:inline', small);
  const hit2 = await durableResume<typeof small>(key, 'preflight:inline');
  console.log('INLINE-ROUNDTRIP:', JSON.stringify(hit2) === JSON.stringify(small) ? 'PAYLOAD-OK' : 'MISMATCH/MISS');
  await markDurableComplete(key);
  const sealed = await durableResume(key, 'preflight:blob');
  console.log('SEALED-AFTER-COMPLETE:', sealed === null);
  const miss = await durableResume(key, 'never-ran');
  console.log('MISS-RETURNS-NULL:', miss === null);
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
