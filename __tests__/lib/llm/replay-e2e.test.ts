/**
 * End-to-end cassette proof — a REAL provider round-trip.
 *
 * A local HTTP server plays an OpenAI-compatible endpoint (DEEPSEEK_BASE_URL
 * is repointed at it via a fresh module load). In `record` mode a real
 * SDK→HTTP→parse round-trip produces the cassette; in `replay` mode every
 * identical request is served from the cassette and the server hit-counter
 * must stay frozen — a drifted request throws CassetteMissError instead of
 * falling back to the (still-configured) provider.
 *
 * Covers streamLLM too: replayed streams emit their recorded content through
 * onChunk without touching the server.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.setTimeout(90000); // fresh module-graph require + real SDK round-trip

const ENV_KEYS = [
  'NOMOSX_LLM_MODE',
  'NOMOSX_LLM_CASSETTE',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'LLM_PRE_SUSPENDED',
  'NOMOSX_FREE_RUN',
];

let server: http.Server;
let hits = 0;
let dir: string;
let cassettePath: string;
const savedEnv: Record<string, string | undefined> = {};

// Single module load: getLlmCassetteMode() reads NOMOSX_LLM_MODE per call,
// so the same unified-llm instance can record then replay — the hit counter
// (not provider deletion) is the zero-network assertion.
type Llm = typeof import('@/lib/llm/unified-llm');
let llm: Llm;
let cassette: typeof import('@/lib/llm/cassette');

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  hits++;
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch { /* empty */ }
    if (parsed.stream === true) {
      const chunk = (content: string) =>
        JSON.stringify({
          id: 'chatcmpl-fake',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'deepseek-chat',
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${chunk('streamed ')}\n\n`);
      res.write(`data: ${chunk('answer')}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1700000000, model: 'deepseek-chat', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 111, completion_tokens: 22 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-fake',
      choices: [{ message: { role: 'assistant', content: '{"verdict":"recorded-live"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 111, completion_tokens: 22 },
    }));
  });
}

const REQUEST = {
  task: 'topic_classification',
  provider: 'deepseek',
  messages: [{ role: 'user', content: 'classify the replay-e2e probe' }],
  temperature: 0.2,
  maxTokens: 64,
  enableCache: false,
} as const;

beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.DEEPSEEK_BASE_URL = baseUrl;
  process.env.LLM_PRE_SUSPENDED = 'anthropic,google,openai,kimi,glm';
  delete process.env.NOMOSX_FREE_RUN;

  jest.resetModules();
  llm = require('@/lib/llm/unified-llm');
  cassette = require('@/lib/llm/cassette');
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'replay-e2e-'));
  cassettePath = join(dir, 'run.jsonl');
  process.env.NOMOSX_LLM_CASSETTE = cassettePath;
  hits = 0;
});

afterEach(() => {
  delete process.env.NOMOSX_LLM_MODE;
  rmSync(dir, { recursive: true, force: true });
});

function setMode(mode: 'record' | 'replay') {
  process.env.NOMOSX_LLM_MODE = mode;
  cassette.resetLlmCassette();
}

describe('record → replay against a real HTTP provider', () => {
  it('records a real SDK round-trip, then replays it with zero network', async () => {
    setMode('record');
    const liveRes = await llm.callLLM(REQUEST as any);
    const hitsAfterRecord = hits;
    expect(hitsAfterRecord).toBeGreaterThanOrEqual(1); // ≥1: SDK retries are legal
    expect(liveRes.content).toBe('{"verdict":"recorded-live"}');

    const entries = readFileSync(cassettePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // One entry per callLLM — SDK-internal HTTP retries stay inside it.
    expect(entries.length).toBe(1);
    expect(entries[0].provider).toBe('deepseek');
    expect(entries[0].response.content).toBe(liveRes.content);

    setMode('replay');
    const replayRes = await llm.callLLM(REQUEST as any);
    expect(replayRes.content).toBe(liveRes.content);
    expect(replayRes.costUsd).toBe(liveRes.costUsd);
    expect(hits).toBe(hitsAfterRecord); // ← zero additional network
  });

  it('replay of a request that drifted throws CassetteMissError and never touches the server', async () => {
    setMode('record');
    await llm.callLLM(REQUEST as any);
    const hitsAfterRecord = hits;

    setMode('replay');
    await expect(
      llm.callLLM({ ...REQUEST, messages: [{ role: 'user', content: 'drifted prompt' }] } as any),
    ).rejects.toThrow(cassette.CassetteMissError);
    expect(hits).toBe(hitsAfterRecord);
  });

  it('streamLLM records the assembled stream and replays it through onChunk with zero network', async () => {
    setMode('record');
    const liveChunks: string[] = [];
    const liveRes = await llm.streamLLM(REQUEST as any, (c) => liveChunks.push(c));
    const hitsAfterRecord = hits;
    expect(hitsAfterRecord).toBeGreaterThanOrEqual(1);
    expect(liveRes.content).toBe('streamed answer');
    expect(liveChunks.join('')).toBe('streamed answer');

    setMode('replay');
    const replayChunks: string[] = [];
    const replayRes = await llm.streamLLM(REQUEST as any, (c) => replayChunks.push(c));
    expect(replayRes.content).toBe('streamed answer');
    expect(replayChunks.join('')).toBe('streamed answer');
    expect(hits).toBe(hitsAfterRecord); // replay never touched the server
  });

  it('coalesced duplicates record their own entry and replay consumes them 1:1', async () => {
    // In-flight coalescing: two same-tick identical calls share ONE provider
    // round-trip at record — but replay resolves instantly and would NOT
    // coalesce, so each issued call must own a cassette entry.
    const req = { task: 'topic_classification', provider: 'deepseek',
      messages: [{ role: 'user', content: 'coalescing probe' }],
      temperature: 0.2, maxTokens: 64 } as const; // cacheable → coalescible

    setMode('record');
    const [a, b] = await Promise.all([llm.callLLM(req as any), llm.callLLM(req as any)]);
    expect(a.content).toBe(b.content);
    expect(b.cached).toBe(true); // proof the second call took the coalesced path
    const hitsAfterRecord = hits;
    expect(hitsAfterRecord).toBeLessThanOrEqual(1); // at most one round-trip

    const entries = readFileSync(cassettePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(entries.length).toBe(2); // one entry per ISSUED call

    setMode('replay');
    const [ra, rb] = await Promise.all([llm.callLLM(req as any), llm.callLLM(req as any)]);
    expect(ra.content).toBe(a.content);
    expect(rb.content).toBe(a.content);
    expect(hits).toBe(hitsAfterRecord); // zero network on replay
    // A third call must now miss — the queue is drained exactly.
    await expect(llm.callLLM(req as any)).rejects.toThrow(cassette.CassetteMissError);
  });

  it('a replayed stream can be served by a buffered recording of the same request', async () => {
    // Cross-serving contract: identical request → identical semantic
    // response, whether the original was streamed or buffered.
    setMode('record');
    await llm.callLLM(REQUEST as any); // buffered recording
    const hitsAfterRecord = hits;

    setMode('replay');
    const chunks: string[] = [];
    const res = await llm.streamLLM(REQUEST as any, (c) => chunks.push(c));
    expect(res.content).toBe('{"verdict":"recorded-live"}');
    expect(chunks.join('')).toBe('{"verdict":"recorded-live"}');
    expect(hits).toBe(hitsAfterRecord);
  });
});
