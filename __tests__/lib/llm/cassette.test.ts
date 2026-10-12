/**
 * Cassette record/replay — offline control of the LLM boundary.
 * Replay must never touch a provider: all API keys are unset in the
 * integration assertions, so any real call would fail.
 */

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  CassetteMissError,
  getLlmCassetteMode,
  recordLlmCassette,
  replayLlmCassette,
  resetLlmCassette,
} from '@/lib/llm/cassette';
import { buildCacheKey, callLLM } from '@/lib/llm/unified-llm';

const ENV_KEYS = ['NOMOSX_LLM_MODE', 'NOMOSX_LLM_CASSETTE'];
let dir: string;
let cassettePath: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cassette-'));
  cassettePath = join(dir, 'run.jsonl');
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.NOMOSX_LLM_CASSETTE = cassettePath;
  resetLlmCassette();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetLlmCassette();
  rmSync(dir, { recursive: true, force: true });
});

describe('cassette mode', () => {
  it('defaults to live and honours record/replay', () => {
    delete process.env.NOMOSX_LLM_MODE;
    expect(getLlmCassetteMode()).toBe('live');
    process.env.NOMOSX_LLM_MODE = 'record';
    expect(getLlmCassetteMode()).toBe('record');
    process.env.NOMOSX_LLM_MODE = 'REPLAY';
    expect(getLlmCassetteMode()).toBe('replay');
    process.env.NOMOSX_LLM_MODE = 'garbage';
    expect(getLlmCassetteMode()).toBe('live');
  });
});

describe('recordLlmCassette / replayLlmCassette', () => {
  it('round-trips a response and replays recorded provider errors as throws', () => {
    const req = { task: 'test', messages: [{ role: 'user', content: 'x' }] };
    recordLlmCassette(req, 'k1', { content: '{"ok":true}', provider: 'glm', model: 'glm-4.5' });
    recordLlmCassette(req, 'k2', undefined, new Error('provider exploded'));

    const lines = readFileSync(cassettePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    expect(replayLlmCassette(req, 'k1')).toMatchObject({ content: '{"ok":true}', provider: 'glm' });
    expect(() => replayLlmCassette(req, 'k2')).toThrow('provider exploded');
  });

  it('consumes duplicate keys FIFO then misses loudly', () => {
    const req = { task: 't', messages: [] };
    recordLlmCassette(req, 'dup', { n: 1 });
    recordLlmCassette(req, 'dup', { n: 2 });
    expect(replayLlmCassette<{ n: number }>(req, 'dup').n).toBe(1);
    expect(replayLlmCassette<{ n: number }>(req, 'dup').n).toBe(2);
    expect(() => replayLlmCassette(req, 'dup')).toThrow(CassetteMissError);
  });

  it('misses loudly on an empty cassette and on prompt drift', () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    expect(() => replayLlmCassette({ task: 'analyst' }, 'missing')).toThrow(CassetteMissError);
    recordLlmCassette({ task: 't', messages: [] }, 'other', {});
    resetLlmCassette();
    expect(() => replayLlmCassette({ task: 't', messages: [] }, 'missing')).toThrow(CassetteMissError);
  });
});

describe('callLLM in replay mode', () => {
  it('serves the recorded response with its recorded cost, no provider configured', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const request = {
      task: 'topic_classification',
      messages: [{ role: 'user', content: 'classify this replay test' }],
      temperature: 0.2,
      maxTokens: 100,
      enableCache: false,
    } as const;
    const recorded = {
      content: '{"domain":"geopolitics"}',
      provider: 'glm',
      model: 'glm-4.5-air',
      family: 'glm',
      tokensInput: 120,
      tokensOutput: 30,
      costUsd: 0.0042,
      cached: false,
    };
    recordLlmCassette(request, buildCacheKey(request as any), recorded);

    const response = await callLLM(request as any);
    expect(response).toMatchObject({
      content: recorded.content,
      provider: 'glm',
      costUsd: 0.0042,
    });
  });

  it('throws CassetteMissError instead of calling any provider on drift', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    recordLlmCassette({ task: 'x', messages: [] }, 'unrelated', { content: 'y' });
    await expect(
      callLLM({ task: 'topic_classification', messages: [{ role: 'user', content: 'never recorded' }] } as any),
    ).rejects.toThrow(CassetteMissError);
  });
});
