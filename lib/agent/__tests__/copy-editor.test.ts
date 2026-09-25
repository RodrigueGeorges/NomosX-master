import { copyEditHtml } from '../copy-editor';
import { callLLM } from '../../llm/unified-llm';

jest.mock('../../llm/unified-llm');
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

const HTML = '<article><p>This report delves into the pact. [SRC-3]</p><p>It is worth noting that trade rose.</p></article>';

function llmReturning(edits: unknown) {
  mockCallLLM.mockResolvedValue({ content: JSON.stringify({ edits }), costUsd: 0.001 } as any);
}

describe('copyEditHtml', () => {
  beforeEach(() => mockCallLLM.mockReset());

  it('returns unchanged when no violations or findings', async () => {
    const r = await copyEditHtml(HTML, { violations: [] });
    expect(r.html).toBe(HTML);
    expect(r.applied).toBe(0);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('applies verbatim find/replace edits', async () => {
    llmReturning([{ find: 'delves into', replace: 'dissects', reason: 'AI tell' }]);
    const r = await copyEditHtml(HTML, { violations: [{ gate: 'G1', pattern: '', match: 'delves into', position: 0, suggestion: 'x' }] });
    expect(r.applied).toBe(1);
    expect(r.html).toContain('dissects');
    expect(r.html).not.toContain('delves into');
  });

  it('rejects edits whose find is not verbatim in the HTML', async () => {
    llmReturning([{ find: 'text that does not exist anywhere', replace: 'x', reason: 'r' }]);
    const r = await copyEditHtml(HTML, { violations: [{ gate: 'G1', pattern: '', match: 'm', position: 0, suggestion: 'x' }] });
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.html).toBe(HTML);
  });

  it('rejects edits that drop citation tokens', async () => {
    llmReturning([{ find: 'the pact. [SRC-3]', replace: 'the agreement.', reason: 'rewrite' }]);
    const r = await copyEditHtml(HTML, { violations: [{ gate: 'G1', pattern: '', match: 'm', position: 0, suggestion: 'x' }] });
    expect(r.applied).toBe(0);
    expect(r.html).toContain('[SRC-3]');
  });

  it('rejects replacements containing HTML tags', async () => {
    llmReturning([{ find: 'delves into', replace: '<script>alert(1)</script>', reason: 'inject' }]);
    const r = await copyEditHtml(HTML, { violations: [{ gate: 'G1', pattern: '', match: 'm', position: 0, suggestion: 'x' }] });
    expect(r.applied).toBe(0);
    expect(r.html).toBe(HTML);
  });

  it('triggers on editorial findings alone', async () => {
    llmReturning([{ find: 'It is worth noting that trade rose.', replace: 'Trade rose.', reason: 'filler' }]);
    const r = await copyEditHtml(HTML, { violations: [], editorialFindings: ['prose is padded'] });
    expect(r.applied).toBe(1);
    expect(r.html).toContain('Trade rose.');
  });

  it('survives malformed LLM output', async () => {
    mockCallLLM.mockResolvedValue({ content: 'not json', costUsd: 0 } as any);
    const r = await copyEditHtml(HTML, { violations: [{ gate: 'G1', pattern: '', match: 'm', position: 0, suggestion: 'x' }] });
    expect(r.applied).toBe(0);
    expect(r.html).toBe(HTML);
  });
});
