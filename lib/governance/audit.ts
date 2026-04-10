/**
 * Agent Governance Layer - Audit Logging
 * 
 * Minimal internal audit trail for critical agent actions.
 * Logs only: publications, holds, silents, violations.
 * 
 * ⚠️ INTERNAL ONLY - No UI, no export, no user access
 */

import { prisma } from '../db';

/**
 * Audit event types
 */
export type AuditAction =
  | "PUBLISH"
  | "HOLD"
  | "SILENT"
  | "PERMISSION_DENIED"
  | "CADENCE_EXCEEDED"
  | "GOVERNANCE_VIOLATION";

/**
 * Audit event structure
 */
export interface AuditEvent {
  agent: string;
  action: AuditAction;
  resource?: string;
  metadata?: Record<string, any>;
}

/**
 * Log an audit event
 * 
 * @internal Only for governance layer use
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: event.agent,
        action: event.action,
        resource: event.resource || null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        timestamp: new Date()
      }
    });
  } catch (error) {
    // Silent fail - audit logging should never break the pipeline
    console.error("[Governance] Audit log failed:", error);
  }
}

/**
 * Log a publication event
 */
export async function logPublication(
  publicationId: string,
  status: "published" | "held" | "silent"
): Promise<void> {
  const actionMap = {
    published: "PUBLISH" as const,
    held: "HOLD" as const,
    silent: "SILENT" as const
  };
  
  await logAuditEvent({
    agent: "publisher",
    action: actionMap[status],
    resource: publicationId,
    metadata: { status }
  });
}

/**
 * Get recent audit logs (internal monitoring only)
 */
export async function getRecentAuditLogs(limit: number = 100) {
  return await prisma.agentAuditLog.findMany({
    take: limit,
    orderBy: { timestamp: "desc" }
  });
}

/**
 * Get audit logs for a specific agent
 */
export async function getAgentAuditLogs(agent: string, limit: number = 50) {
  return await prisma.agentAuditLog.findMany({
    where: { agent },
    take: limit,
    orderBy: { timestamp: "desc" }
  });
}

/**
 * Get violation count (for monitoring)
 */
export async function getViolationCount(since?: Date): Promise<number> {
  return await prisma.agentAuditLog.count({
    where: {
      action: {
        in: ["PERMISSION_DENIED", "CADENCE_EXCEEDED", "GOVERNANCE_VIOLATION"]
      },
      timestamp: since ? { gte: since } : undefined
    }
  });
}
