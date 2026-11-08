import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

if (process.env.NOMOSX_TEST_OFFLINE === '1') {
  const blocked = () => { throw new Error('Network disabled during offline tests') }
  require('net').Socket.prototype.connect = blocked
  require('tls').connect = blocked
  global.fetch = blocked
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/offline'
}

// --- Polyfills for the jsdom test environment ---------------------------------
// jsdom does not expose Node's Web Fetch API or text codecs, which the OpenAI SDK
// and other libraries require at import time.
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder
if (typeof global.fetch === 'undefined') {
  // require() (not import) so it runs AFTER TextDecoder is defined: undici needs it at load.
  const { fetch, Headers, Request, Response } = require('undici')
  global.fetch = fetch
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}

// Provide dummy required env vars so modules that validate env at import time
// (lib/env.ts via unified-llm / pipeline) can load in unit tests.
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/nomosx_test'
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-key-with-at-least-32-characters'

// Jest 30 removed the global `fail()` helper. Restore it for legacy tests.
if (typeof global.fail === 'undefined') {
  global.fail = (reason = 'fail() called') => {
    throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason))
  }
}

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: '',
      asPath: '',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))
// Mock Sentry — its server instrumentation opens an AsyncLocalStorage handle
// at import time (bound-anonymous-fn), which keeps Jest from exiting cleanly.
// Error reporting is irrelevant in unit tests.
jest.mock('@sentry/nextjs', () => {
  const noop = () => {}
  const scope = { setTag: noop, setExtra: noop, setContext: noop, setLevel: noop }
  const api = {
    init: noop,
    captureException: noop,
    captureMessage: noop,
    withScope: (fn) => fn(scope),
    getCurrentScope: () => scope,
    addBreadcrumb: noop,
    flush: async () => true,
  }
  return { __esModule: true, default: api, ...api }
})
