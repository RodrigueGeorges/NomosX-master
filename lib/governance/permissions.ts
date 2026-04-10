/**
 * Agent Governance Layer - Permission Definitions
 * 
 * Explicit permissions for each agent role.
 * Principle: Least privilege - agents can only perform authorized actions.
 * 
 * ⚠️ INTERNAL ONLY - Never expose to UI or marketing
 */

import { AgentRole } from './roles';

/**
 * Permission types
 */
export type Permission =
  // Read permissions
  | "read:sources"
  | "read:enriched_sources"
  | "read:ranked_sources"
  | "read:claims"
  | "read:analysis"
  | "read:draft"
  | "read:publications"
  | "read:topics"
  | "read:signals"
  // Write permissions
  | "write:sources"
  | "write:enriched_sources"
  | "write:ranked_sources"
  | "write:claims"
  | "write:analysis"
  | "write:draft"
  | "write:signals"
  | "write:digest"
  | "write:radar_cards"
  // Critical permissions
  | "publish:publication"
  | "hold:publication"
  | "silent:publication"
  // System permissions
  | "monitor:system"
  | "audit:logs";

/**
 * Permissions by agent role
 * 
 * Each agent has explicit, minimal permissions.
 * Permission matrix: maps each agent role to its allowed permissions
 */
export const AgentPermissions: Record<string, Permission[]> = {
  [AgentRole.SCOUT]: [
    "read:sources",
    "write:sources",
    "write:signals"
  ],
  
  [AgentRole.INDEX]: [
    "read:sources",
    "write:enriched_sources"
  ],
  
  [AgentRole.RANK]: [
    "read:enriched_sources",
    "write:ranked_sources"
  ],
  
  [AgentRole.READER]: [
    "read:ranked_sources",
    "write:claims"
  ],
  
  [AgentRole.ANALYST]: [
    "read:ranked_sources",
    "read:claims",
    "write:analysis"
  ],
  
  [AgentRole.EDITOR]: [
    "read:analysis",
    "read:ranked_sources",
    "write:draft"
  ],
  
  [AgentRole.PUBLISHER]: [
    "read:draft",
    "read:publications",
    "publish:publication",
    "hold:publication",
    "silent:publication"
  ],
  
  [AgentRole.DIGEST]: [
    "read:topics",
    "read:sources",
    "write:digest"
  ],
  
  [AgentRole.RADAR]: [
    "read:sources",
    "read:signals",
    "write:radar_cards"
  ],
  
  [AgentRole.MONITORING]: [
    "read:sources",
    "read:publications",
    "monitor:system",
    "audit:logs"
  ]
} as const;

/**
 * Check if an agent role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = getPermissions(role);
  return permissions.includes(permission);
}

/**
 * Get permissions for a given agent role
 */
export function getPermissions(role: string): Permission[] {
  return AgentPermissions[role] || [];
}
