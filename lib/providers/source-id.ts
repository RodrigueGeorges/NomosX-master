import { createHash } from 'crypto';

/**
 * Stable, collision-resistant source id fragment.
 *
 * Many providers used `Buffer.from(url).toString('base64').slice(0, 24)` —
 * truncating base64 collides whenever two URLs share a long common prefix
 * (same host + similar path), silently merging distinct sources in dedup
 * (audit finding). A sha1 slice is deterministic AND uniformly distributed.
 */
export function sourceIdHash(seed: string, len = 20): string {
  return createHash('sha1').update(seed).digest('hex').slice(0, len);
}
