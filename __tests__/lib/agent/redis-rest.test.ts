/**
 * Upstash REST client — the HTTP fallback for deployments that only have
 * UPSTASH_REDIS_REST_* credentials. Verifies command mapping and the
 * circuit breaker that keeps a dead endpoint from taxing every call.
 */

import { createUpstashRestClient } from '@/lib/agent/redis-rest';

const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

function okResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}
function errResponse(status = 500) {
  return { ok: false, status, json: async () => ({}) } as Response;
}

beforeEach(() => jest.clearAllMocks());

describe('createUpstashRestClient', () => {
  it('maps commands to Upstash REST bodies', async () => {
    fetchMock.mockResolvedValue(okResponse('PONG'));
    const r = createUpstashRestClient('https://db.upstash.io', 'tok');
    expect(await r.ping()).toBe('PONG');
    expect(fetchMock).toHaveBeenCalledWith('https://db.upstash.io', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(['PING']);
  });

  it('surfaces Upstash error payloads as exceptions', async () => {
    fetchMock.mockResolvedValue(okResponse({ error: 'WRONGPASS invalid password' }));
    const r = createUpstashRestClient('https://db.upstash.io', 'tok');
    await expect(r.get('k')).rejects.toThrow('WRONGPASS');
  });

  it('opens the circuit after 3 consecutive failures and fails fast', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
    const r = createUpstashRestClient('https://dead.upstash.io', 'tok');
    for (let i = 0; i < 3; i++) {
      await expect(r.get('k')).rejects.toThrow();
    }
    const callsAfterOpen = fetchMock.mock.calls.length;
    await expect(r.get('k')).rejects.toThrow('circuit-open');
    expect(fetchMock.mock.calls.length).toBe(callsAfterOpen); // no network hit
  });
});
