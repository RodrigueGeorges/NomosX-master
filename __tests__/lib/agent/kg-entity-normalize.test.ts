import { normalizeKGEntity } from '@/lib/agent/knowledge-infrastructure';

describe('normalizeKGEntity', () => {
  it('coerces string aliases/sourceIds to arrays', () => {
    const e = normalizeKGEntity({
      id: 'e1', name: 'Carbon Tax', type: 'policy',
      aliases: 'carbon pricing', sourceIds: 'src1',
    });
    expect(e).toMatchObject({ aliases: ['carbon pricing'], sourceIds: ['src1'], type: 'policy' });
  });

  it('handles null/missing aliases and sourceIds (live crash regression)', () => {
    const e = normalizeKGEntity({ id: 'e2', name: 'OPEC', aliases: null, sourceIds: undefined });
    expect(e).toMatchObject({ aliases: [], sourceIds: [] });
  });

  it('rejects non-object and nameless entities', () => {
    expect(normalizeKGEntity(null)).toBeNull();
    expect(normalizeKGEntity('string')).toBeNull();
    expect(normalizeKGEntity({ aliases: [] })).toBeNull();
    expect(normalizeKGEntity({ name: '   ' })).toBeNull();
  });

  it('filters non-string array members and defaults unknown type to concept', () => {
    const e = normalizeKGEntity({
      name: 'Lithium', type: 'bogus',
      aliases: ['Li', 42, null, ''], sourceIds: [7, 'src9'],
    });
    expect(e).toMatchObject({ type: 'concept', aliases: ['Li'], sourceIds: ['src9'] });
    expect(e!.id).toBeTruthy();
  });
});
