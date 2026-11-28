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

it('a sterile forecastQuestion does not skip a subject with real surface (dual-surface)', async () => {
  // Canary: the forecast question's verification vocabulary ("implement",
  // "2027", "explicitly addresses") appears in no real document — probing it
  // alone measured 2 relevant hits and skipped a gate-passed topic whose
  // subject ("US AI policy frameworks × self-regulation") is a major area.
  const SUBJECT = 'How do current US AI policy frameworks interact with industry self-regulation?';
  const FORECAST = 'Will the US government implement a new AI policy framework by 2027-12-28 that explicitly addresses computational systems?';
  const subjectHit = (t: string) => hit(t);
  openAlexImpl(async (q: string) => q.startsWith('How do')
    ? [subjectHit('US AI policy frameworks and industry self-regulation dynamics'),
       subjectHit('AI policy frameworks and the limits of industry self-regulation')]
    : []);
  crossrefImpl(async () => []);
  thinkTanksImpl(async (q: string) => q.startsWith('How do')
    ? [subjectHit('US AI policy frameworks beyond industry self-regulation'),
       subjectHit('How AI policy frameworks reshape industry self-regulation')]
    : [hit('unrelated marine brief')]);
  const probe = await probeTopicViability(SUBJECT, FORECAST);
  expect(probe.viable).toBe(true);
  expect(probe.relevant).toBe(4);
});

it('skip requires BOTH surfaces near-zero', async () => {
  const SUBJECT = 'Ambroise de Rancourt emissary listing';
  const FORECAST = 'Will Ambroise de Rancourt be officially listed as an emissary by 2026?';
  openAlexImpl(async () => [hit('unrelated treaty')]);
  crossrefImpl(async () => []);
  thinkTanksImpl(async () => [hit('unrelated marine brief')]);
  const probe = await probeTopicViability(SUBJECT, FORECAST);
  expect(probe.viable).toBe(false);
  expect(probe.relevant).toBe(0);
});
