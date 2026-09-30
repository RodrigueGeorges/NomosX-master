jest.mock('@/lib/http-client', () => ({ fetchFromProvider: jest.fn(async () => ({ results: [] })) }));
jest.mock('@/lib/env', () => ({ env: { OPENALEX_API_KEY: 'test-only', OPENALEX_API: 'https://api.openalex.org/works' } }));

import { fetchFromProvider } from '@/lib/http-client';

const fetchMock = jest.fn(async () => new Response('{}'));

test('importing OpenAlex does not spend credits or open a connection', async () => {
  const original = global.fetch;
  global.fetch = fetchMock;
  try {
    jest.isolateModules(() => {
      const provider = require('@/lib/providers/openalex') as typeof import('@/lib/providers/openalex');
      expect(typeof provider.searchOpenAlex).toBe('function');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fetchFromProvider).not.toHaveBeenCalled();
  } finally {
    global.fetch = original;
  }
});
