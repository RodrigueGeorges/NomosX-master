/**
 * Tests for CITATION GUARD Agent
 * Critical for preventing hallucinations
 */

// Mock OpenAI before importing pipeline
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { citationGuard } from '../pipeline';

describe('CITATION GUARD Agent', () => {
  describe('Valid citations', () => {
    it('should pass when all citations are valid', () => {
      const analysis = {
        summary: 'Research shows [SRC-1] and [SRC-2] agree on key points.',
        consensus: 'Multiple studies [SRC-3] confirm this.',
      };
      
      const result = citationGuard(analysis, 5);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(3);
      expect(result.invalid).toEqual([]);
    });

    it('should pass with single citation', () => {
      const analysis = {
        summary: 'Research shows [SRC-1] this finding.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(1);
    });

    it('should pass with multiple citations on same source', () => {
      const analysis = {
        summary: 'Study [SRC-1] shows X and [SRC-1] also demonstrates Y.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(1); // Should count unique sources
    });
  });

  describe('Invalid citations', () => {
    it('should fail when citation index is out of bounds', () => {
      const analysis = {
        summary: 'Research shows [SRC-5] is important.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(5);
    });

    it('should fail when no citations present', () => {
      const analysis = {
        summary: 'Research shows many things but no citations.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(false);
      expect(result.usedCount).toBe(0);
    });

    it('should fail with citation index 0', () => {
      const analysis = {
        summary: 'According to [SRC-0] this is wrong.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(0);
    });

    it('should fail with negative index', () => {
      const analysis = {
        summary: 'According to [SRC--1] this is wrong.',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle nested objects', () => {
      const analysis = {
        debate: {
          pro: 'Argument [SRC-1] supports this.',
          con: 'Counter-argument [SRC-2] disagrees.',
        },
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(2);
    });

    it('should handle arrays', () => {
      const analysis = {
        claims: [
          'First claim [SRC-1]',
          'Second claim [SRC-2]',
          'Third claim [SRC-3]',
        ],
      };
      
      const result = citationGuard(analysis, 5);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(3);
    });

    it('should handle mixed valid and invalid citations', () => {
      const analysis = {
        summary: 'Valid [SRC-1] and invalid [SRC-10] citations.',
      };
      
      const result = citationGuard(analysis, 5);
      
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(10);
      expect(result.usedCount).toBe(2); // Counts both valid and invalid
    });

    it('should handle empty object', () => {
      const analysis = {};
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(false);
      expect(result.usedCount).toBe(0);
    });

    it('should handle null values', () => {
      const analysis = {
        summary: null,
        consensus: 'Some text [SRC-1]',
      };
      
      const result = citationGuard(analysis, 3);
      
      expect(result.ok).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle large text with many citations', () => {
      const citations = Array.from({ length: 50 }, (_, i) => `[SRC-${i + 1}]`).join(' ');
      const analysis = {
        summary: `Large text with many citations: ${citations}`,
      };
      
      const result = citationGuard(analysis, 50);
      
      expect(result.ok).toBe(true);
      expect(result.usedCount).toBe(50);
    });
  });
});
