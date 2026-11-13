/**
 * Question-form gate — deterministic rejection of news headlines and
 * event titles that are not research questions (CTO lever 5).
 */

import { questionFormIssues } from '@/lib/agent/pipeline-v2';

describe('questionFormIssues', () => {
  it('rejects event titles and announcement phrasing', () => {
    expect(questionFormIssues('A Conversation With Prime Minister Jonas Gahr Støre…')).not.toEqual([]);
    expect(questionFormIssues('Watch: Live from the Brussels Summit')).not.toEqual([]);
    expect(questionFormIssues('Remarks by the Secretary on trade policy')).not.toEqual([]);
    expect(questionFormIssues('Full event: Central Bank press conference highlights')).not.toEqual([]);
  });

  it('rejects ellipsis/colon titles with no analytic framing', () => {
    expect(questionFormIssues('The new Arctic shipping routes…')).not.toEqual([]);
    expect(questionFormIssues('Semiconductor subsidies: the new wave.')).not.toEqual([]);
  });

  it('accepts real questions', () => {
    expect(questionFormIssues('What is the impact of lithium export controls on EV supply chains?')).toEqual([]);
    expect(questionFormIssues('How will EU carbon border adjustments reshape Turkish steel exports by 2030?')).toEqual([]);
    expect(questionFormIssues('Assess the geopolitical risks of rare-earth dependence for European defense')).toEqual([]);
  });

  it('accepts legitimate noun-phrase research topics', () => {
    expect(questionFormIssues('EU carbon border mechanism and Turkish steel')).toEqual([]);
    expect(questionFormIssues('Critical minerals supply chain concentration in the Gulf')).toEqual([]);
  });
});
