/**
 * NomosX Pipeline Test Script
 * Tests the full publication funnel via HTTP API
 * Run: node scripts/test-pipeline.cjs
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TOPIC = "Impact of AI on scientific research methodology";

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function log(step, status, detail) {
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${step}] ${detail}`);
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  NomosX Pipeline Funnel Test');
  console.log(`  Topic: "${TOPIC}"`);
  console.log('═══════════════════════════════════════════════════\n');

  // ── STEP 1: Health Check ──
  console.log('── STEP 1: Health Check ──');
  try {
    const health = await request('GET', '/api/health');
    if (health.status === 200) {
      const d = health.data;
      log('HEALTH', 'OK', `DB: ${d.services?.database?.status}, Redis: ${d.services?.redis?.status}`);
      log('HEALTH', 'OK', `Users: ${d.metrics?.users}, Publications: ${d.metrics?.publications}, Verticals: ${d.metrics?.verticals}`);
    } else {
      log('HEALTH', 'FAIL', `Status ${health.status}`);
      process.exit(1);
    }
  } catch (e) {
    log('HEALTH', 'FAIL', e.message);
    process.exit(1);
  }

  // ── STEP 2: Scout (ingestion) ──
  console.log('\n── STEP 2: Scout / Ingestion ──');
  try {
    const scout = await request('POST', '/api/ingestion/run', {
      query: TOPIC,
      providers: ['openalex', 'crossref', 'arxiv'],
      perProvider: 5,
    });
    if (scout.status === 200 || scout.status === 201) {
      const d = scout.data;
      log('SCOUT', 'OK', `Found: ${d.found ?? d.total ?? JSON.stringify(d).slice(0, 80)}`);
    } else {
      log('SCOUT', 'WARN', `Status ${scout.status}: ${JSON.stringify(scout.data).slice(0, 120)}`);
    }
  } catch (e) {
    log('SCOUT', 'WARN', `Non-blocking: ${e.message}`);
  }

  // ── STEP 3: Researcher Ownership Detection ──
  console.log('\n── STEP 3: Researcher Ownership ──');
  try {
    const resStatus = await request('GET', '/api/researchers/status');
    if (resStatus.status === 200) {
      const d = resStatus.data;
      log('OWNERSHIP', 'OK', `Researchers: ${JSON.stringify(d).slice(0, 120)}`);
    } else {
      log('OWNERSHIP', 'WARN', `Status ${resStatus.status} — route may not exist`);
    }
  } catch (e) {
    log('OWNERSHIP', 'WARN', `Non-blocking: ${e.message}`);
  }

  // ── STEP 4: Editorial Planning ──
  console.log('\n── STEP 4: Editorial Planning ──');
  try {
    const editorial = await request('GET', '/api/cron/editorial-plan', null, {
      'x-cron-secret': process.env.CRON_SECRET || 'test',
    });
    log('EDITORIAL', editorial.status === 200 ? 'OK' : 'WARN',
      `Status ${editorial.status}: ${JSON.stringify(editorial.data).slice(0, 120)}`);
  } catch (e) {
    log('EDITORIAL', 'WARN', `Non-blocking: ${e.message}`);
  }

  // ── STEP 5: Full Pipeline (brief/auto) — THE MAIN TEST ──
  console.log('\n── STEP 5: Full Pipeline via /api/brief/auto ──');
  console.log('   (This runs: SCOUT→INDEX→EMBED→DEDUP→RANK→READER V3→ANALYST V3→');
  console.log('    HARVARD COUNCIL→GUARD→EDITOR→CITATION VERIFIER→CRITICAL LOOP V2→');
  console.log('    DEBATE→META-ANALYSIS→DEVIL\'S ADVOCATE→PUBLISHER→KNOWLEDGE GRAPH)');
  console.log('   ⏳ Running... (may take 30-120s)\n');

  const pipelineStart = Date.now();
  try {
    const pipeline = await request('POST', '/api/brief/auto', {
      question: TOPIC,
      format: 'brief',
    });

    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);

    if (pipeline.status === 200 && pipeline.data.success) {
      const d = pipeline.data;
      log('PIPELINE', 'OK', `Brief generated in ${elapsed}s`);
      log('PIPELINE', 'OK', `Brief ID: ${d.briefId}`);
      log('PIPELINE', 'OK', `Format: ${d.format}`);
      log('PIPELINE', 'OK', `Sources found: ${d.stats?.sourcesFound ?? 'N/A'}`);
      log('PIPELINE', 'OK', `Sources used: ${d.stats?.sourcesUsed ?? 'N/A'}`);
      log('PIPELINE', 'OK', `Trust score: ${d.stats?.trustScore ?? 'N/A'}`);
      log('PIPELINE', 'OK', `Citation integrity: ${d.stats?.citationIntegrity ?? 'N/A'}%`);
      log('PIPELINE', 'OK', `Devil's Advocate: ${d.stats?.devilsAdvocate ?? 'N/A'}`);
      if (d.smartSelection) {
        log('PIPELINE', 'OK', `Smart providers: ${d.smartSelection.providers?.slice(0, 3).join(', ')}...`);
      }

      // ── STEP 6: Verify brief was saved ──
      console.log('\n── STEP 6: Verify Brief Saved ──');
      const briefCheck = await request('GET', `/api/briefs/${d.briefId}`).catch(() => null);
      if (briefCheck?.status === 200) {
        log('BRIEF_SAVE', 'OK', `Brief retrievable at /api/briefs/${d.briefId}`);
        const b = briefCheck.data;
        log('BRIEF_SAVE', 'OK', `Word count: ~${Math.round((b.html?.length || 0) / 5)} words`);
      } else {
        log('BRIEF_SAVE', 'WARN', `Brief not directly accessible (may need auth)`);
      }

    } else if (pipeline.status === 401) {
      log('PIPELINE', 'WARN', `Auth required — testing via cron route instead`);
      await testViaCron();
    } else {
      log('PIPELINE', 'FAIL', `Status ${pipeline.status} in ${elapsed}s: ${JSON.stringify(pipeline.data).slice(0, 200)}`);
    }
  } catch (e) {
    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    log('PIPELINE', 'FAIL', `Error after ${elapsed}s: ${e.message}`);
  }

  // ── STEP 7: Check Pipeline Runs ──
  console.log('\n── STEP 7: Pipeline Runs History ──');
  try {
    const runs = await request('GET', '/api/pipeline-runs?limit=3');
    if (runs.status === 200) {
      const d = runs.data;
      const list = d.runs || d.data || d;
      if (Array.isArray(list) && list.length > 0) {
        log('RUNS', 'OK', `Last ${list.length} runs:`);
        list.slice(0, 3).forEach(r => {
          log('RUNS', 'OK', `  → ${r.id?.slice(0, 8)}... | ${r.status} | ${r.format} | trust:${r.trustScore ?? 'N/A'} | $${r.totalCostUsd?.toFixed(3) ?? 'N/A'}`);
        });
      } else {
        log('RUNS', 'WARN', `No runs found or unexpected format`);
      }
    } else {
      log('RUNS', 'WARN', `Status ${runs.status}`);
    }
  } catch (e) {
    log('RUNS', 'WARN', `Non-blocking: ${e.message}`);
  }

  // ── STEP 8: Knowledge Graph ──
  console.log('\n── STEP 8: Knowledge Graph ──');
  try {
    const kg = await request('GET', '/api/knowledge?limit=5');
    if (kg.status === 200) {
      const d = kg.data;
      const concepts = d.concepts || d.data || d;
      log('KG', 'OK', `Concepts in graph: ${Array.isArray(concepts) ? concepts.length : JSON.stringify(d).slice(0, 80)}`);
    } else {
      log('KG', 'WARN', `Status ${kg.status}`);
    }
  } catch (e) {
    log('KG', 'WARN', `Non-blocking: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Test Complete');
  console.log('═══════════════════════════════════════════════════\n');
}

async function testViaCron() {
  console.log('   Testing via /api/cron/generate-briefs...');
  try {
    const cron = await request('POST', '/api/cron/generate-briefs', {}, {
      'x-cron-secret': process.env.CRON_SECRET || 'test',
    });
    log('CRON_PIPELINE', cron.status === 200 ? 'OK' : 'WARN',
      `Status ${cron.status}: ${JSON.stringify(cron.data).slice(0, 200)}`);
  } catch (e) {
    log('CRON_PIPELINE', 'FAIL', e.message);
  }
}

runTests().catch(console.error);
