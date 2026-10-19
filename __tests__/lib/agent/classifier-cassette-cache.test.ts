/**
 * Cassette-mode cache bypass for the topic classifier.
 *
 * The 30-min TTL cache is wall-clock: a ~45min gap at record expires it while
 * a second-scale replay hits it — the recorded `topic_classification` cassette
 * entry is then never consumed and every downstream key drifts. Under
 * record/replay the classifier must always issue the call.
 */

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

import { callLLM } from '@/lib/llm/unified-llm';
import { classifyTopic } from '@/lib/agent/topic-classifier';

const callLLMMock = jest.mocked(callLLM);

function classificationContent() {
  return {
    content: JSON.stringify({
      domains: [{ domain: 'technology', confidence: 0.9 }],
      dimensions: [],
      detectedSubject: 'test subject',
      urgency: 'medium',
      tier: 'standard',
      reasoning: 'test reasoning',
    }),
    costUsd: 0,
  };
}

describe('classifyTopic cache under cassette modes', () => {
  beforeEach(() => {
    callLLMMock.mockReset();
    callLLMMock.mockImplementation(async () => classificationContent() as never);
  });

  it('live mode caches: second call returns cached:true without a new LLM call', async () => {
    const saved = process.env.NOMOSX_LLM_MODE;
    delete process.env.NOMOSX_LLM_MODE;
    try {
      const topic = 'live-mode-cache-topic-alpha';
      const first = await classifyTopic(topic);
      const second = await classifyTopic(topic);
      expect(callLLMMock).toHaveBeenCalledTimes(1);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.NOMOSX_LLM_MODE;
      else process.env.NOMOSX_LLM_MODE = saved;
    }
  });

  it('replay mode bypasses the cache: every call issues a fresh LLM call', async () => {
    const saved = process.env.NOMOSX_LLM_MODE;
    process.env.NOMOSX_LLM_MODE = 'replay';
    try {
      const topic = 'replay-mode-cache-topic-beta';
      const first = await classifyTopic(topic);
      const second = await classifyTopic(topic);
      expect(callLLMMock).toHaveBeenCalledTimes(2);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.NOMOSX_LLM_MODE;
      else process.env.NOMOSX_LLM_MODE = saved;
    }
  });
});
