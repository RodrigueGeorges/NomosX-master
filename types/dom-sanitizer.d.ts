/**
 * Type declarations for the Sanitizer API (Chrome 105+, Firefox 128+)
 * Spec: https://wicg.github.io/sanitizer-api/
 */
interface SanitizerConfig {
  allowElements?: string[];
  allowAttributes?: Record<string, string[]>;
  blockElements?: string[];
  dropElements?: string[];
  dropAttributes?: Record<string, string[]>;
}

declare class Sanitizer {
  constructor(config?: SanitizerConfig);
  sanitize(input: DocumentFragment): DocumentFragment;
}

interface SanitizerSetHTMLOptions {
  sanitizer: Sanitizer;
}

interface HTMLElement {
  setHTML(input: string, options?: SanitizerSetHTMLOptions): void;
}
