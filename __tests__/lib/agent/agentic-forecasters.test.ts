import { parseBelief, familyOfProvider } from '@/lib/agent/agentic-forecasters';

describe('parseBelief', () => {
  it('parses a valid belief state and clamps p', () => {
    const b = parseBelief(JSON.stringify({
      p: 1.4, confidence: 'high',
      evidenceFor: ['c1: supports'], evidenceAgainst: [],
      openQuestions: ['q?'], baseRate: 'br', links: { '2': 0.7, '3': -0.5 },
    }));
    expect(b).not.toBeNull();
    expect(b!.p).toBe(0.98); // clamped
    expect(b!.confidence).toBe('high');
    expect(b!.links[2]).toBeCloseTo(0.7, 5);
    expect(b!.links[3]).toBe(0.02); // clamped
  });

  it('rejects malformed responses — a null belief, never a guess', () => {
    expect(parseBelief('not json')).toBeNull();
    expect(parseBelief('{"confidence":"high"}')).toBeNull(); // no p
    expect(parseBelief('{"p":"high"}')).toBeNull();
  });

  it('tolerates missing optional fields', () => {
    const b = parseBelief('{"p":0.4}');
    expect(b).not.toBeNull();
    expect(b!.confidence).toBe('low');
    expect(b!.links).toEqual({});
    expect(b!.openQuestions).toEqual([]);
  });
});

describe('familyOfProvider', () => {
  it('derives family from the resolved model id on freepool', () => {
    expect(familyOfProvider('freepool', 'groq/llama-3.3-70b')).toBe('meta-llama');
    expect(familyOfProvider('freepool', 'qwen/qwen3-32b')).toBe('qwen');
    expect(familyOfProvider('freepool', 'google/gemini-2.0')).toBe('google');
    expect(familyOfProvider('freepool', 'cohere/command-a')).toBe('cohere');
    expect(familyOfProvider('freepool', 'unknown/model-x')).toBe('model-x');
  });

  it('maps known providers directly', () => {
    expect(familyOfProvider('glm')).toBe('glm');
    expect(familyOfProvider('kimi')).toBe('kimi');
    expect(familyOfProvider('deepseek')).toBe('deepseek');
  });
});
