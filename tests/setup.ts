// Test setup file
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup global test environment
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup
});
