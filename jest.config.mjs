import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

// Integration tests require live infrastructure (Postgres, Redis, the OpenAI API,
// or outbound network) and therefore cannot run in the default unit-test CI.
// They are excluded here and run separately via `npm run test:integration`
// (jest.integration.config.mjs).
export const integrationTestPatterns = [
  '/__tests__/lib/llm/unified-llm\\.test\\.',
  '/__tests__/pipeline/pipeline-22-experts\\.test\\.',
  '/__tests__/lib/agent/analyst-agent\\.test\\.',
  '/__tests__/performance\\.test\\.',
  '/__tests__/lib/cache/redis-cache\\.test\\.',
  '\\.integration\\.test\\.',
]

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  // Tests are server/lib logic (no React rendering). Node env exposes native
  // fetch / TextEncoder, which the OpenAI SDK and other libs require at import.
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Resolve TypeScript before JavaScript so tests use the real .ts implementations
  // instead of stale auto-generated .js/.mjs stubs that shadow them (matches the
  // Next.js build, which prefers .ts). Fixes broken imports in legacy provider stubs.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // next-intl ships ESM-only dist files; stub the middleware factory in tests.
    '^next-intl/middleware$': '<rootDir>/__tests__/__mocks__/next-intl-middleware.js',
    '^next-intl/routing$': '<rootDir>/__tests__/__mocks__/next-intl-routing.js',
  },
  testMatch: [
    '**/__tests__/**/*.(test|spec).[jt]s?(x)',
    '**/?(*.)+(test|spec).[jt]s?(x)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', ...integrationTestPatterns],
  // next-intl ships ESM-only .js entrypoints — transform them so middleware
  // tests can import the middleware chain.
  transformIgnorePatterns: ['node_modules[\\\\/](?!next-intl[\\\\/])'],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60,
    },
  },
}

export default createJestConfig(config)
