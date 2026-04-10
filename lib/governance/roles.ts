/**
 * Agent Governance Layer - Role Definitions
 * 
 * Defines the strict roles for each agent in the NomosX Think Tank.
 * Each agent has a single, well-defined responsibility.
 * 
 * ⚠️ INTERNAL ONLY - Never expose to UI or marketing
 */

/**
 * Agent roles in the NomosX Think Tank system
 */
export const AgentRole = {
  SCOUT: "scout",
  INDEX: "index",
  RANK: "rank",
  READER: "reader",
  ANALYST: "analyst",
  EDITOR: "editor",
  PUBLISHER: "publisher",
  DIGEST: "digest",
  RADAR: "radar",
  MONITORING: "monitoring"
} as const;

export type AgentRole = typeof AgentRole[keyof typeof AgentRole];

/**
 * Human-readable descriptions of each agent role
 */
export const AgentRoleDescriptions: Record<string, string> = {
  [AgentRole.SCOUT]: "Collects raw research from academic and institutional APIs",
  [AgentRole.INDEX]: "Enriches sources with author/institution metadata (ROR, ORCID)",
  [AgentRole.RANK]: "Selects top sources by quality or novelty",
  [AgentRole.READER]: "Extracts claims, methods, results from abstracts",
  [AgentRole.ANALYST]: "Synthesizes research into decision-ready analysis",
  [AgentRole.EDITOR]: "Renders analysis into premium HTML briefs",
  [AgentRole.PUBLISHER]: "Controls publication cadence and final approval",
  [AgentRole.DIGEST]: "Creates weekly summaries for topic subscriptions",
  [AgentRole.RADAR]: "Identifies weak signals and emerging trends",
  [AgentRole.MONITORING]: "Tracks system health and agent performance"
} as const;
