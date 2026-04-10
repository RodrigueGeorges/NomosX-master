# Agent Governance Layer

**Version**: 1.0  
**Date**: 2026-01-29  
**Status**: ✅ ACTIVE

---

## 🎯 Overview

The **Agent Governance Layer** is an internal control system that ensures all agents in the NomosX Think Tank operate within strict, well-defined boundaries. This system enforces permissions, tracks critical actions, and maintains editorial discipline.

**⚠️ INTERNAL ONLY** - This system is never exposed to users or mentioned in marketing materials.

---

## 🏗️ Architecture

### Core Principles

1. **Least Privilege** - Each agent has minimal permissions required for its role
2. **Fail Fast** - Violations throw immediately, preventing unauthorized actions
3. **Audit Trail** - Critical actions are logged for internal review
4. **Silence is Success** - The system operates invisibly when functioning correctly

### Components

```
lib/governance/
├── roles.ts         # Agent role definitions
├── permissions.ts   # Permission matrix
├── guard.ts         # Permission enforcement
├── rules.ts         # Editorial cadence rules
├── audit.ts         # Audit logging
└── index.ts         # Public API
```

---

## 👥 Agent Roles

Each agent has a single, well-defined responsibility:

| Role | Purpose |
|------|---------|
| **SCOUT** | Collects raw research from academic and institutional APIs |
| **INDEX** | Enriches sources with author/institution metadata (ROR, ORCID) |
| **RANK** | Selects top sources by quality or novelty |
| **READER** | Extracts claims, methods, results from abstracts |
| **ANALYST** | Synthesizes research into decision-ready analysis |
| **EDITOR** | Renders analysis into premium HTML briefs |
| **PUBLISHER** | Controls publication cadence and final approval |
| **DIGEST** | Creates weekly summaries for topic subscriptions |
| **RADAR** | Identifies weak signals and emerging trends |
| **MONITORING** | Tracks system health and agent performance |

---

## 🔐 Permissions

### Permission Types

#### Read Permissions
- `read:sources` - Read source data
- `read:enriched_sources` - Read enriched source data
- `read:ranked_sources` - Read ranked sources
- `read:claims` - Read extracted claims
- `read:analysis` - Read analysis output
- `read:draft` - Read draft publications
- `read:publications` - Read published content
- `read:topics` - Read topic configurations
- `read:signals` - Read detected signals

#### Write Permissions
- `write:sources` - Create/update sources
- `write:enriched_sources` - Update sources with enrichment data
- `write:ranked_sources` - Update source rankings
- `write:claims` - Create extracted claims
- `write:analysis` - Create analysis output
- `write:draft` - Create draft publications
- `write:signals` - Create signals
- `write:digest` - Create digests
- `write:radar_cards` - Create radar cards

#### Critical Permissions
- `publish:publication` - Publish content (PUBLISHER only)
- `hold:publication` - Hold publication (PUBLISHER only)
- `silent:publication` - Silent publication (PUBLISHER only)

#### System Permissions
- `monitor:system` - Access system metrics
- `audit:logs` - Access audit logs

### Permission Matrix

| Agent | Permissions |
|-------|-------------|
| **SCOUT** | `read:sources`, `write:sources`, `write:signals` |
| **INDEX** | `read:sources`, `write:enriched_sources` |
| **RANK** | `read:enriched_sources`, `write:ranked_sources` |
| **READER** | `read:ranked_sources`, `write:claims` |
| **ANALYST** | `read:ranked_sources`, `read:claims`, `write:analysis` |
| **EDITOR** | `read:analysis`, `read:ranked_sources`, `write:draft` |
| **PUBLISHER** | `read:draft`, `read:publications`, `publish:publication`, `hold:publication`, `silent:publication` |
| **DIGEST** | `read:topics`, `read:sources`, `write:digest` |
| **RADAR** | `read:sources`, `read:signals`, `write:radar_cards` |
| **MONITORING** | `read:sources`, `read:publications`, `monitor:system`, `audit:logs` |

---

## 🛡️ Enforcement

### Permission Guard

All critical actions pass through the governance guard:

```typescript
import { AgentRole, assertPermission } from "../governance";

// Example: SCOUT writing sources
assertPermission(AgentRole.SCOUT, "write:sources");

// Example: PUBLISHER publishing content
assertPermission(AgentRole.PUBLISHER, "publish:publication");
```

**Violations throw immediately**:
```typescript
GovernanceViolationError: scout cannot perform publish:publication
```

### Enforcement Points

Guards are integrated at the entry point of each agent function:

- `scout()` - Asserts `write:sources`
- `indexAgent()` - Asserts `write:enriched_sources`
- `readerAgent()` - Asserts `write:claims`
- `analystAgent()` - Asserts `write:analysis`
- `renderBriefHTML()` - Asserts `write:draft`
- Publication functions - Assert `publish:publication`

---

## 📏 Editorial Discipline

### Cadence Limits

To maintain institutional-grade quality, publication cadence is strictly controlled:

| Period | Limit |
|--------|-------|
| **Daily** | 1 publication max |
| **Weekly** | 3 publications max |
| **Monthly** | 12 publications max |

### Cadence Enforcement

```typescript
import { enforceCadenceLimit } from "../governance";

// Before publishing
await enforceCadenceLimit();
// Throws CadenceViolationError if limit exceeded
```

**Violations are logged and blocked**:
```typescript
CadenceViolationError: Editorial cadence exceeded: 3/3 publications this week
```

### Cadence Status

Internal monitoring can check current status:

```typescript
const status = await getCadenceStatus();
// {
//   daily: { current: 0, limit: 1, remaining: 1 },
//   weekly: { current: 2, limit: 3, remaining: 1 }
// }
```

---

## 📊 Audit Trail

### What is Logged

Only critical actions are logged (minimal overhead):

1. **Publications** - `PUBLISH`, `HOLD`, `SILENT`
2. **Violations** - `PERMISSION_DENIED`, `CADENCE_EXCEEDED`
3. **Governance Events** - `GOVERNANCE_VIOLATION`

### Audit Log Structure

```typescript
{
  id: string,
  agent: string,           // "scout", "publisher", etc.
  action: string,          // "PUBLISH", "PERMISSION_DENIED", etc.
  resource: string | null, // publication_id, source_id, etc.
  metadata: string | null, // JSON string with context
  timestamp: DateTime
}
```

### Logging Examples

```typescript
// Log a publication
await logPublication(publicationId, "published");

// Log a violation (automatic)
// Triggered by assertPermission() failure
```

### Accessing Audit Logs

**Internal use only** - No UI, no user access:

```typescript
// Recent logs
const logs = await getRecentAuditLogs(100);

// Agent-specific logs
const scoutLogs = await getAgentAuditLogs("scout", 50);

// Violation count
const violations = await getViolationCount(since);
```

---

## 🚫 Forbidden Actions

### What Agents CANNOT Do

1. **No agent can publish without PUBLISHER**
   - Only PUBLISHER has `publish:publication` permission
   
2. **No agent can bypass cadence**
   - Cadence checks are enforced before publication
   - No override mechanism exists
   
3. **No agent can act outside its role**
   - Permissions are strictly enforced
   - Violations throw immediately
   
4. **No agent can write non-existent sources/citations**
   - Citation guard validates all [SRC-N] references
   - Invalid citations block publication

---

## ✅ Success Criteria

The governance layer is working correctly when:

1. **No violations occur** - All agents stay within bounds
2. **Cadence is respected** - Publication limits are never exceeded
3. **All publications are traceable** - Audit trail is complete
4. **System operates invisibly** - No user-facing impact
5. **Product functions normally** - No regression in features

---

## 🔧 Implementation Details

### Integration Pattern

```typescript
// 1. Import governance
import { AgentRole, assertPermission } from "../governance";

// 2. Assert permission at function entry
export async function myAgent() {
  assertPermission(AgentRole.MY_AGENT, "write:something");
  
  // ... rest of agent logic
}
```

### Error Handling

```typescript
try {
  assertPermission(AgentRole.SCOUT, "publish:publication");
} catch (error) {
  if (error instanceof GovernanceViolationError) {
    // Violation logged automatically
    // Error bubbles up to caller
  }
}
```

### Cadence Checking

```typescript
// Before publication
try {
  await enforceCadenceLimit();
  await enforceDailyCadenceLimit();
  
  // Proceed with publication
  await publishContent();
  
  // Log publication
  await logPublication(id, "published");
} catch (error) {
  if (error instanceof CadenceViolationError) {
    // Cadence exceeded - hold publication
    await logPublication(id, "held");
  }
}
```

---

## 📈 Monitoring

### Internal Metrics

Track governance effectiveness:

1. **Violation Rate** - Should be 0
2. **Cadence Utilization** - Current vs. limit
3. **Audit Log Volume** - Publications + violations
4. **Agent Activity** - Actions per agent

### Health Checks

```typescript
// Check for recent violations
const violations = await getViolationCount(
  new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24h
);

if (violations > 0) {
  console.warn(`[Governance] ${violations} violations in last 24h`);
}
```

---

## 🎓 Best Practices

### For Developers

1. **Always assert permissions** at agent entry points
2. **Never bypass guards** - No "emergency" overrides
3. **Log critical actions** - Publications, holds, silents
4. **Test governance** - Verify violations are caught
5. **Keep it invisible** - No user-facing changes

### For System Design

1. **Fail fast** - Violations should throw immediately
2. **Minimal logging** - Only critical events
3. **No configuration** - Rules are hard-coded
4. **No UI** - Governance is internal only
5. **Audit trail** - Complete but lightweight

---

## 🔒 Security Considerations

### Threat Model

The governance layer protects against:

1. **Rogue agents** - Agents acting outside their role
2. **Cadence bypass** - Publishing too frequently
3. **Citation fraud** - Invalid or missing citations
4. **Audit gaps** - Untracked critical actions

### Defense Mechanisms

1. **Permission checks** - Enforced at runtime
2. **Cadence limits** - Database-backed counters
3. **Citation validation** - Regex-based verification
4. **Audit logging** - Immutable trail

---

## 📝 Changelog

### Version 1.0 (2026-01-29)

**Initial Release**

- ✅ Agent roles defined (10 roles)
- ✅ Permission matrix implemented (25+ permissions)
- ✅ Permission guard with fail-fast enforcement
- ✅ Editorial cadence rules (daily, weekly, monthly)
- ✅ Audit logging for critical actions
- ✅ Integration with existing pipeline
- ✅ Zero user-facing changes

---

## 🚀 Future Enhancements

**Not planned for V1**:

- Dynamic permission configuration
- User-facing governance dashboard
- Permission delegation
- Temporal permissions (time-limited)
- Multi-tenant governance

**Principle**: Keep it simple, internal, and invisible.

---

**Maintained by**: NomosX Engineering  
**Contact**: Internal documentation only  
**Status**: Production-ready
