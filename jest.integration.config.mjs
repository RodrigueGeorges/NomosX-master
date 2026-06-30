import nextJest from 'next/jest.js'
import { integrationTestPatterns } from './jest.config.mjs'

const createJestConfig = nextJest({
  dir: './',
})

// Integration suite: runs ONLY the tests that require live infrastructure
// (Postgres, Redis, the OpenAI API, or outbound network access).
// Run with: npm run test:integration
// Make sure DATABASE_URL, REDIS_URL and the relevant API keys are configured.
/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Only match the files flagged as integration tests in jest.config.mjs.
  testMatch: ['**/*.(test|spec).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  // Invert the default exclusion: keep ONLY integration tests by ignoring
  // everything that is NOT in the integration list.
  testRegex: undefined,
}

const asyncConfig = createJestConfig(config)

// next/jest returns an async config function; wrap it to inject a custom
// testMatch limited to the integration patterns once defaults are resolved.
export default async () => {
  const resolved = await asyncConfig()
  return {
    ...resolved,
    testPathIgnorePatterns: ['/node_modules/', '/.next/'],
    testMatch: undefined,
    testRegex: integrationTestPatterns,
  }
}
