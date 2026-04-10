/**
 * Agent Governance Layer - Permission Guard
 * 
 * Core enforcement mechanism for agent permissions.
 * All critical actions MUST pass through this guard.
 * 
 * Principle: Fail fast - violations throw immediately.
 * 
 * ⚠️ INTERNAL ONLY - Never expose to UI or marketing
 */

import { AgentRole } from './roles';
import { Permission,hasPermission } from './permissions';
import { logAuditEvent } from './audit';

/**
 * Governance violation error
 */
export class GovernanceViolationError extends Error {
  constructor(
    public readonly agent: string,
    public readonly permission: Permission,
    public readonly context?: string
  ) {
    super(
      `Governance violation: ${agent} cannot perform ${permission}${
        context ? ` (${context})` : ""
      }`
    );
    this.name = "GovernanceViolationError";
  }
}

/**
 * Assert that an agent has permission to perform an action
 * 
 * @throws {GovernanceViolationError} if permission is denied
 * 
 * @example
 * assertPermission(AgentRole.SCOUT, "write:sources");
 * assertPermission(AgentRole.PUBLISHER, "publish:publication");
 */
export function assertPermission(
  agent: AgentRole,
  permission: Permission,
  context?: string
): void {
  const allowed = hasPermission(agent, permission);
  
  if (!allowed) {
    // Log the violation
    logAuditEvent({
      agent,
      action: "PERMISSION_DENIED",
      resource: permission,
      metadata: { context }
    }).catch(err => {
      console.error("[Governance] Failed to log violation:", err);
    });
    
    // Fail fast
    throw new GovernanceViolationError(agent, permission, context);
  }
}

/**
 * Assert multiple permissions at once
 * 
 * @throws {GovernanceViolationError} if any permission is denied
 */
export function assertPermissions(
  role: AgentRole,
  permissions: Permission[],
  context?: string
): void {
  for (const permission of permissions) {
    assertPermission(role, permission, context);
  }
}

/**
 * Wrap an agent action with permission check
 * 
 * @example
 * const publishBrief = withPermission(
 *   AgentRole.PUBLISHER,
 *   "publish:publication",
 *   async (briefId) => {
 *     // actual publish logic
 *   }
 * );
 */
export function withPermission<T extends (...args: any[]) => any>(
  agent: AgentRole,
  permission: Permission,
  action: T
): T {
  return ((...args: Parameters<T>) => {
    assertPermission(agent, permission);
    return action(...args);
  }) as T;
}
