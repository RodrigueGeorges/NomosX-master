/**
 * Shared input/result types for the think-tank cycle workflow.
 * Kept dependency-free — the workflow sandbox must be able to load this file.
 */

export interface ThinkTankCycleWorkflowInput {
  mode: 'weekly' | 'breaking';
  maxPublications?: number;
  budgetUsd?: number;
  dryRun?: boolean;
}

export interface ThinkTankCycleWorkflowResult {
  mode: string;
  success: boolean;
  collected: number;
  published: number;
  held: number;
  skipped: number;
  failed: number;
  totalCostUsd: number;
  durationMs: number;
  topics: string[];
  errors: string[];
}
