import { hasRunHeadroom, remainingRunMs, runDeadlineAt } from '@/lib/agent/pipeline-steps/time-budget';

afterEach(() => {
  delete process.env.NOMOSX_FREE_RUN;
  jest.restoreAllMocks();
});

it('grants headroom when no pipelineStart is available (detached callers)', () => {
  expect(hasRunHeadroom(undefined, true, 1_800_000)).toBe(true);
  expect(remainingRunMs(undefined, false)).toBe(Number.POSITIVE_INFINITY);
});

it('denies an expensive step inside the deadline tail', () => {
  // 70min elapsed on a 75min strategic run — a ~10min re-analysis + the
  // render/gate tail cannot fit in 5 remaining minutes.
  const pipelineStart = Date.now() - 70 * 60_000;
  expect(hasRunHeadroom(pipelineStart, true, 1_800_000)).toBe(false);
  expect(remainingRunMs(pipelineStart, true)).toBeLessThan(6 * 60_000);
  // …but a cheap step with a smaller reserve still fits.
  expect(hasRunHeadroom(pipelineStart, true, 120_000)).toBe(true);
});

it('uses the longer free-run deadline', () => {
  process.env.NOMOSX_FREE_RUN = '1';
  const pipelineStart = Date.now() - 120 * 60_000;
  // 120min elapsed: past the 75min paid deadline, inside the 180min free one.
  expect(hasRunHeadroom(pipelineStart, true, 1_800_000)).toBe(true);
});

it('computes the deadline from pipelineStart plus the format budget', () => {
  const start = Date.now();
  expect(runDeadlineAt(start, true)).toBe(start + 4_500_000);
  expect(runDeadlineAt(start, false)).toBe(start + 3_900_000);
});
