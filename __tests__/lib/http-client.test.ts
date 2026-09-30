jest.mock('@/lib/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('@/lib/agent/redis-simple', () => ({ simpleRedisManager: { isRedisConnected: () => false } }));

import { httpGet, getHttpInflightStats } from '@/lib/http-client';
import { withExecutionSignal, withExecutionScope, getExecutionBudgetUsage } from '@/lib/worker/execution-scope';

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterEach(() => { global.fetch = originalFetch; });

test('declared oversized bodies are cancelled without downloading them', async () => {
  const cancel = jest.fn();
  fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), {
    headers: { 'content-length': String(100 * 1024 * 1024) },
  }));
  await expect(httpGet('https://example.test/large', { retries: 0 })).rejects.toThrow(/limit|large|size/i);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('chunked oversized responses cannot bypass the byte limit or trigger retries', async () => {
  const cancel = jest.fn();
  fetchMock.mockImplementation(async () => {
    let chunks = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (chunks++ < 12) controller.enqueue(new Uint8Array(1024 * 1024));
        else controller.close();
      },
      cancel,
    }));
  });
  await expect(httpGet('https://example.test/chunked', { retries: 3, retryDelay: 1 })).rejects.toThrow(/limit|large|size/i);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('timeout includes the body, not only response headers', async () => {
  const cancel = jest.fn();
  fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
  await expect(httpGet('https://example.test/stalled', { timeout: 30, retries: 0 })).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(getHttpInflightStats().active).toBe(0);
});

test('parent cancellation aborts the body and suppresses all HTTP retries', async () => {
  const controller = new AbortController();
  const cancel = jest.fn();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  fetchMock.mockImplementation(async () => {
    started();
    return new Response(new ReadableStream({ cancel }));
  });
  const work = withExecutionSignal(controller.signal, () => httpGet('https://example.test/cancel', { retries: 3 }));
  const failed = expect(work).rejects.toThrow('lease lost');
  await ready;
  controller.abort(new Error('lease lost'));
  await failed;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(getHttpInflightStats().active).toBe(0);
});

test('300 logical calls never exceed the shared in-flight limit', async () => {
  let active = 0;
  let peak = 0;
  fetchMock.mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return new Response('{"ok":true}');
  });
  const results = await Promise.all(Array.from({ length: 300 }, () =>
    httpGet('https://example.test/small', { retries: 0 }),
  ));
  expect(results).toHaveLength(300);
  expect(peak).toBeLessThanOrEqual(getHttpInflightStats().cap);
  expect(getHttpInflightStats()).toMatchObject({ active: 0, pending: 0 });
});

test('per-upstream budget stops real requests once the cap is reached', async () => {
  fetchMock.mockImplementation(async () => new Response('{"ok":true}'));
  const controller = new AbortController();
  const results = await withExecutionSignal(controller.signal, () =>
    Promise.allSettled(Array.from({ length: 410 }, (_, i) =>
      httpGet(`https://api.test-upstream.test/x?p=${i}`, { retries: 0, rateLimiterKey: 'test-upstream' }),
    )),
  );
  const ok = results.filter(r => r.status === 'fulfilled');
  const blocked = results.filter(r =>
    r.status === 'rejected' && /budget exhausted/i.test(String(r.reason?.message)),
  );
  expect(ok).toHaveLength(400);
  expect(blocked).toHaveLength(10);
  expect(fetchMock).toHaveBeenCalledTimes(400);
});

test('a new execution scope gets a fresh upstream budget', async () => {
  fetchMock.mockImplementation(async () => new Response('{"ok":true}'));
  const first = new AbortController();
  await withExecutionSignal(first.signal, () =>
    Promise.allSettled(Array.from({ length: 405 }, (_, i) =>
      httpGet(`https://api.test-upstream.test/x?a=${i}`, { retries: 0, rateLimiterKey: 'test-upstream' }),
    )),
  );
  const second = new AbortController();
  const results = await withExecutionSignal(second.signal, () =>
    Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
      httpGet(`https://api.test-upstream.test/x?b=${i}`, { retries: 0, rateLimiterKey: 'test-upstream' }),
    )),
  );
  expect(results.every(r => r.status === 'fulfilled')).toBe(true);
});

test('sibling scopes each get a fresh upstream cap but share the job-root bound', async () => {
  fetchMock.mockImplementation(async () => new Response('{"ok":true}'));
  const job = new AbortController();
  const perNode = await withExecutionSignal(job.signal, async () => {
    const tally: number[] = [];
    for (let n = 0; n < 6; n++) {
      const results = await withExecutionScope(`node-${n}`, () =>
        Promise.allSettled(Array.from({ length: 400 }, (_, i) =>
          httpGet(`https://api.test-upstream.test/y?n=${n}&i=${i}`, { retries: 0, rateLimiterKey: 'test-upstream' }),
        )),
      );
      tally.push(results.filter(r => r.status === 'fulfilled').length);
    }
    return tally;
  });
  // scope cap 400/node; root cap 4×400=1600 → nodes 0-3 pass fully, 4-5 denied
  expect(perNode).toEqual([400, 400, 400, 400, 0, 0]);
});

test('retries consume real budget — a 4-attempt call counts 4 wire requests', async () => {
  fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
  const controller = new AbortController();
  const usage = await withExecutionSignal(controller.signal, async () => {
    await httpGet('https://api.test-upstream.test/x?r=1', {
      retries: 3, retryDelay: 1, rateLimiterKey: 'test-upstream',
    }).catch(() => {});
    return getExecutionBudgetUsage('http:test-upstream');
  });
  expect(usage).toBe(4);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
