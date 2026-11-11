/**
 * Upstash REST-backed Redis client.
 *
 * The deployment only has UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (HTTP API credentials) — no rediss:// TCP endpoint — so ioredis cannot
 * connect and every cache/rate-limit path silently degrades. The Upstash
 * REST API accepts the same commands as a JSON array over HTTPS, which
 * covers the entire method surface NomosX actually uses
 * (get/setex/set/del/incr/expire/ttl/ping/flushdb).
 *
 * This is NOT a full ioredis replacement: no pipelining, no pub/sub, no
 * transactions. It exists so the small cache surface keeps working.
 */

interface UpstashRestClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<'OK'>;
  setex(key: string, ttl: number, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  ping(): Promise<'PONG'>;
  flushdb(): Promise<'OK'>;
  quit(): Promise<'OK'>;
  connect(): Promise<void>;
  disconnect(): void;
  on(event: string, fn: (...args: unknown[]) => void): unknown;
  readonly status: string;
}

export function createUpstashRestClient(restUrl: string, token: string): UpstashRestClient {
  const endpoint = restUrl.replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Circuit breaker: a dead endpoint (NXDOMAIN, expired DB) must not cost a
  // DNS lookup + error log on every cache call. Three consecutive failures
  // open the circuit; it half-closes on the next attempt after a cooldown.
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;
  const FAILURE_THRESHOLD = 3;
  const CIRCUIT_COOLDOWN_MS = 60_000;

  // Single-command bodies return the result directly.
  async function cmd(...args: Array<string | number>): Promise<unknown> {
    if (Date.now() < circuitOpenUntil) {
      throw new Error('upstash-rest circuit-open');
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(args.map(String)),
    });
    if (!res.ok) throw new Error(`upstash-rest ${res.status}`);
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
      throw new Error(String((data as { error: unknown }).error));
    }
    consecutiveFailures = 0;
    return data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guarded = <A extends any[], R>(fn: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      try {
        return await fn(...a);
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          consecutiveFailures = 0;
        }
        throw err;
      }
    };

  return {
    get: guarded((key: string) => cmd('GET', key)) as (key: string) => Promise<string | null>,
    set: guarded((key: string, value: string, ...args: unknown[]) => cmd('SET', key, value, ...args.map(String))) as (key: string, value: string, ...args: unknown[]) => Promise<'OK'>,
    setex: guarded((key: string, ttl: number, value: string) => cmd('SETEX', key, ttl, value)) as (key: string, ttl: number, value: string) => Promise<'OK'>,
    del: guarded((...keys: string[]) => cmd('DEL', ...keys)) as (...keys: string[]) => Promise<number>,
    incr: guarded((key: string) => cmd('INCR', key)) as (key: string) => Promise<number>,
    expire: guarded((key: string, seconds: number) => cmd('EXPIRE', key, seconds)) as (key: string, seconds: number) => Promise<number>,
    ttl: guarded((key: string) => cmd('TTL', key)) as (key: string) => Promise<number>,
    ping: guarded(() => cmd('PING')) as () => Promise<'PONG'>,
    flushdb: guarded(() => cmd('FLUSHDB')) as () => Promise<'OK'>,
    quit: async () => 'OK' as const,
    connect: async () => {},
    disconnect: () => {},
    on: () => undefined,
    get status() { return 'ready'; },
  };
}
