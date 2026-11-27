/**
 * topic-viability — a probe that measured a broken surface cannot establish
 * "near-zero footprint" (run-17: both academic channels circuit-tripped → a
 * gate-accepted subject skipped on our own outage).
 */

import { probeTopicViability } from '@/lib/agent/topic-viability';

jest.mock('@/lib/providers/openalex', () => ({ searchOpenAlex: jest.fn() }));
jest.mock('@/lib/providers/crossref', () => ({ searchCrossref: jest.fn() }));
jest.mock('@/lib/providers/institutional/think-tanks/global-think-tanks', () => ({ searchGlobalThinkTanks: jest.fn() }));

const { searchOpenAlex } = jest.requireMock('@/lib/providers/openalex');
const { searchCrossref } = jest.requireMock('@/lib/providers/crossref');
const { searchGlobalThinkTanks } = jest.requireMock('@/lib/providers/institutional/think-tanks/global-think-tanks');

const openAlexImpl = (v: any) => searchOpenAlex.mockImplementation(v);
const crossrefImpl = (v: any) => searchCrossref.mockImplementation(v);
const thinkTanksImpl = (v: any) => searchGlobalThinkTanks.mockImplementation(v);

const Q = 'Will the Indian Parliament pass the bills to increase Lok Sabha seats?';
const hit = (t: string) => ({ title: t, abstract: `${t} report` });
const boom = () => Promise.reject(new Error('Circuit breaker tripped'));

beforeEach(() => {
  for (const m of [searchOpenAlex, searchCrossref, searchGlobalThinkTanks]) m.mockReset();
});

it('skips only on a REAL near-zero footprint measured on working channels', async () => {
  openAlexImpl(async () => [hit('unrelated nuclear treaty')]);
  crossrefImpl(async () => []);
  thinkTanksImpl(async () => [hit('marine biodiversity brief')]);
  const probe = await probeTopicViability(Q);
  expect(probe.viable).toBe(false);
  expect(probe.relevant).toBe(0);
});

it('≥2 channels down → surface unknown → proceeds (fail-open)', async () => {
  openAlexImpl(boom);
  crossrefImpl(boom);
  thinkTanksImpl(async () => [hit('marine biodiversity brief')]);
  const probe = await probeTopicViability(Q);
  expect(probe.viable).toBe(true);
  expect(probe.error).toContain('Circuit breaker');
});

it('one channel down still counts real hits on the others', async () => {
  openAlexImpl(boom);
  crossrefImpl(async () => [
    hit('Lok Sabha seats delimitation'), hit('Indian Parliament bills increase'),
    hit('Lok Sabha seats allocation'), hit('Indian Parliament seats reform'),
  ]);
  thinkTanksImpl(async () => []);
  const probe = await probeTopicViability(Q);
  expect(probe.viable).toBe(true);
  expect(probe.relevant).toBe(4);
});
