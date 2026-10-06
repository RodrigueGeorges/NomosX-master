import { httpGet } from '@/lib/http-client';
import { searchGlobalScience, SCIENCE_FEEDS } from '@/lib/providers/institutional/science/global-science';
import { withExecutionSignal } from '@/lib/worker/execution-scope';

jest.mock('@/lib/http-client', () => ({ httpGet: jest.fn() }));
jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    parseString: jest.fn(async () => ({ items: [{ title: 'Science research', link: 'https://example.test/article' }] })),
    parseURL: jest.fn(() => { throw new Error('Unscoped RSS transport'); }),
  })),
}));

beforeEach(() => {
  jest.mocked(httpGet).mockReset().mockResolvedValue('<rss/>');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('routes RSS transport through the bounded cancellable HTTP client', async () => {
  const sources = await searchGlobalScience('science research');
  expect(sources.length).toBeGreaterThan(0);
  expect(httpGet).toHaveBeenCalledTimes(SCIENCE_FEEDS.length);
  expect(httpGet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    responseType: 'text', retries: 0, timeout: 15000,
  }));
});

test('cancellation propagates and does not mark all feeds unhealthy for the next run', async () => {
  const controller = new AbortController();
  jest.mocked(httpGet).mockImplementation(async () => {
    controller.abort(new Error('lease lost'));
    throw controller.signal.reason;
  });
  await expect(withExecutionSignal(controller.signal, () => searchGlobalScience('science research')))
    .rejects.toThrow('lease lost');
  jest.mocked(httpGet).mockReset().mockResolvedValue('<rss/>');
  await searchGlobalScience('science research');
  expect(httpGet).toHaveBeenCalledTimes(SCIENCE_FEEDS.length);
});

test('provider failure enters cooldown but is retried after it expires', async () => {
  jest.mocked(httpGet).mockRejectedValue(new Error('HTTP 503'));
  expect(await searchGlobalScience('science research')).toEqual([]);
  jest.mocked(httpGet).mockClear();
  await searchGlobalScience('science research');
  expect(httpGet).not.toHaveBeenCalled();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 600001);
  try {
    jest.mocked(httpGet).mockResolvedValue('<rss/>');
    await searchGlobalScience('science research');
    expect(httpGet).toHaveBeenCalledTimes(SCIENCE_FEEDS.length);
  } finally {
    clock.mockRestore();
  }
});
