import { toJsonSafe, stripPgUnsafeControls } from '@/lib/json-safe';

const NUL = '\u0000';
const BEL = '\u0007';
const UNIT_SEP = '\u001f';

describe('toJsonSafe', () => {
  it('strips NUL and C0 controls that Postgres jsonb rejects', () => {
    const dirty = { a: `x${NUL}y${BEL}z`, nested: [{ c: `bad${UNIT_SEP}char` }] };
    const out = toJsonSafe(dirty);
    expect(out.a).toBe('xyz');
    expect(out.nested[0].c).toBe('badchar');
    // Serialized form must not contain the 0000 escape Postgres rejects
    expect(JSON.stringify(out)).not.toContain('\\u0000');
  });

  it('preserves tab/LF/CR and normal unicode', () => {
    const out = toJsonSafe({ s: 'a\tb\nc\rd é' });
    expect(out.s).toBe('a\tb\nc\rd é');
  });

  it('keeps JSON round-trip semantics (dates → ISO, undefined dropped)', () => {
    const out = toJsonSafe({ d: new Date('2026-01-01T00:00:00Z'), u: undefined, n: null });
    expect(out.d).toBe('2026-01-01T00:00:00.000Z');
    expect('u' in out).toBe(false);
    expect(out.n).toBeNull();
  });

  it('handles primitives and arrays', () => {
    expect(toJsonSafe(`a${NUL}b`)).toBe('ab');
    expect(toJsonSafe([1, `x${NUL}y`, { z: BEL }])).toEqual([1, 'xy', { z: '' }]);
  });
});

describe('stripPgUnsafeControls', () => {
  it('removes control chars from raw text without JSON round-trip', () => {
    expect(stripPgUnsafeControls(`a${NUL}b\tc`)).toBe('ab\tc');
  });
});
