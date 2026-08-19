/**
 * Prompt Optimizer module — NomosX Sprint 6 (Gap 1)
 *
 * Optimisation end-to-end des prompts via "textual gradients" (DSPy/TextGrad/Trace-OPTO).
 *
 * @see ROADMAP_2026.md — Gap 1
 */

export {
  optimizePrompt,
  optimizeAllPrompts,
  getActivePromptVersion,
  getActiveSystemPrompt,
  getPromptVersions,
  registerDefaultPrompt,
  registerPromptVersion,
  setActivePromptVersion,
  loadPromptArchive,
  updatePromptMetrics,
} from './prompt-optimizer';
export type {
  PromptVersion,
  PromptOptimizationInput,
  PromptOptimizationResult,
  OptimizationFeedback,
  FeedbackSource,
} from './prompt-optimizer';
