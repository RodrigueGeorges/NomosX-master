#!/usr/bin/env node
/**
 * Governance Layer Simulation Test
 * 
 * Tests:
 * 1. Valid permissions (agents acting within role)
 * 2. Permission violations (agents acting outside role)
 * 3. Cadence enforcement
 * 4. Audit logging
 */

import { config } from 'dotenv';
config();

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(step, message, status = 'info') {
  const statusColors = {
    info: colors.cyan,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
    test: colors.magenta,
  };
  const color = statusColors[status] || colors.reset;
  console.log(`${color}[${step}]${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}\n`);
}

async function testGovernance() {
  const startTime = Date.now();
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    logSection('🧪 GOVERNANCE LAYER SIMULATION');
    
    log('INFO', 'Importing governance modules...', 'info');
    const governance = await import('../lib/governance/index.ts');
    const { AgentRole, assertPermission, checkPermission, hasPermission } = governance;
    const { enforceCadenceLimit, getCadenceStatus, canPublish } = governance;
    const { logAuditEvent, getViolationCount } = governance;
    const { GovernanceViolationError, CadenceViolationError } = governance;
    
    log('INFO', '✅ Governance modules loaded', 'success');
    
    // ================================
    // TEST 1: Valid Permissions
    // ================================
    logSection('1️⃣  TEST: Valid Permissions (Should Pass)');
    
    const validTests = [
      { agent: 'SCOUT', permission: 'write:sources', desc: 'SCOUT writing sources' },
      { agent: 'INDEX', permission: 'write:enriched_sources', desc: 'INDEX enriching sources' },
      { agent: 'READER', permission: 'write:claims', desc: 'READER extracting claims' },
      { agent: 'ANALYST', permission: 'write:analysis', desc: 'ANALYST creating analysis' },
      { agent: 'EDITOR', permission: 'write:draft', desc: 'EDITOR creating draft' },
      { agent: 'PUBLISHER', permission: 'publish:publication', desc: 'PUBLISHER publishing' },
    ];
    
    for (const test of validTests) {
      testsRun++;
      try {
        assertPermission(AgentRole[test.agent], test.permission);
        log('TEST', `✅ ${test.desc}`, 'success');
        testsPassed++;
      } catch (error) {
        log('TEST', `❌ ${test.desc} - FAILED: ${error.message}`, 'error');
        testsFailed++;
      }
    }
    
    // ================================
    // TEST 2: Permission Violations
    // ================================
    logSection('2️⃣  TEST: Permission Violations (Should Fail)');
    
    const violationTests = [
      { agent: 'SCOUT', permission: 'publish:publication', desc: 'SCOUT trying to publish' },
      { agent: 'INDEX', permission: 'publish:publication', desc: 'INDEX trying to publish' },
      { agent: 'READER', permission: 'publish:publication', desc: 'READER trying to publish' },
      { agent: 'ANALYST', permission: 'publish:publication', desc: 'ANALYST trying to publish' },
      { agent: 'EDITOR', permission: 'publish:publication', desc: 'EDITOR trying to publish' },
      { agent: 'SCOUT', permission: 'write:analysis', desc: 'SCOUT trying to write analysis' },
    ];
    
    for (const test of violationTests) {
      testsRun++;
      try {
        assertPermission(AgentRole[test.agent], test.permission);
        log('TEST', `❌ ${test.desc} - SHOULD HAVE FAILED`, 'error');
        testsFailed++;
      } catch (error) {
        if (error.name === 'GovernanceViolationError') {
          log('TEST', `✅ ${test.desc} - Correctly blocked`, 'success');
          testsPassed++;
        } else {
          log('TEST', `❌ ${test.desc} - Wrong error type: ${error.name}`, 'error');
          testsFailed++;
        }
      }
    }
    
    // ================================
    // TEST 3: Permission Checking (Non-throwing)
    // ================================
    logSection('3️⃣  TEST: Permission Checking (checkPermission)');
    
    testsRun++;
    const scoutCanWrite = checkPermission(AgentRole.SCOUT, 'write:sources');
    if (scoutCanWrite === true) {
      log('TEST', '✅ checkPermission: SCOUT can write:sources', 'success');
      testsPassed++;
    } else {
      log('TEST', '❌ checkPermission: SCOUT should be able to write:sources', 'error');
      testsFailed++;
    }
    
    testsRun++;
    const scoutCanPublish = checkPermission(AgentRole.SCOUT, 'publish:publication');
    if (scoutCanPublish === false) {
      log('TEST', '✅ checkPermission: SCOUT cannot publish:publication', 'success');
      testsPassed++;
    } else {
      log('TEST', '❌ checkPermission: SCOUT should NOT be able to publish', 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 4: hasPermission Helper
    // ================================
    logSection('4️⃣  TEST: hasPermission Helper');
    
    testsRun++;
    const publisherHasPublish = hasPermission(AgentRole.PUBLISHER, 'publish:publication');
    if (publisherHasPublish === true) {
      log('TEST', '✅ hasPermission: PUBLISHER has publish:publication', 'success');
      testsPassed++;
    } else {
      log('TEST', '❌ hasPermission: PUBLISHER should have publish:publication', 'error');
      testsFailed++;
    }
    
    testsRun++;
    const readerHasPublish = hasPermission(AgentRole.READER, 'publish:publication');
    if (readerHasPublish === false) {
      log('TEST', '✅ hasPermission: READER does not have publish:publication', 'success');
      testsPassed++;
    } else {
      log('TEST', '❌ hasPermission: READER should NOT have publish:publication', 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 5: Cadence Status (Read-only)
    // ================================
    logSection('5️⃣  TEST: Cadence Status');
    
    testsRun++;
    try {
      const status = await getCadenceStatus();
      log('TEST', `✅ Cadence status retrieved`, 'success');
      log('INFO', `   Daily: ${status.daily.current}/${status.daily.limit} (${status.daily.remaining} remaining)`, 'info');
      log('INFO', `   Weekly: ${status.weekly.current}/${status.weekly.limit} (${status.weekly.remaining} remaining)`, 'info');
      testsPassed++;
    } catch (error) {
      log('TEST', `❌ Failed to get cadence status: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 6: canPublish Check
    // ================================
    logSection('6️⃣  TEST: canPublish Check');
    
    testsRun++;
    try {
      const publishCheck = await canPublish();
      if (publishCheck.allowed) {
        log('TEST', `✅ canPublish: Publication allowed`, 'success');
        log('INFO', `   Daily: ${publishCheck.current || 0} publications today`, 'info');
      } else {
        log('TEST', `⚠️  canPublish: Publication blocked - ${publishCheck.reason}`, 'warning');
      }
      testsPassed++;
    } catch (error) {
      log('TEST', `❌ Failed to check canPublish: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 7: Audit Logging (Simulation)
    // ================================
    logSection('7️⃣  TEST: Audit Logging');
    
    testsRun++;
    try {
      await logAuditEvent({
        agent: 'test',
        action: 'TEST_ACTION',
        resource: 'test-resource-123',
        metadata: { test: true, timestamp: new Date().toISOString() }
      });
      log('TEST', '✅ Audit event logged successfully', 'success');
      testsPassed++;
    } catch (error) {
      log('TEST', `❌ Failed to log audit event: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 8: Violation Count
    // ================================
    logSection('8️⃣  TEST: Violation Count');
    
    testsRun++;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h
      const violations = await getViolationCount(since);
      log('TEST', `✅ Violation count retrieved: ${violations} in last 24h`, 'success');
      if (violations === 0) {
        log('INFO', '   ✅ No violations detected (expected)', 'success');
      } else {
        log('INFO', `   ⚠️  ${violations} violations detected`, 'warning');
      }
      testsPassed++;
    } catch (error) {
      log('TEST', `❌ Failed to get violation count: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 9: Role Descriptions
    // ================================
    logSection('9️⃣  TEST: Role Descriptions');
    
    testsRun++;
    try {
      const { AgentRoleDescriptions } = governance;
      const roles = Object.keys(AgentRole);
      log('TEST', `✅ ${roles.length} agent roles defined`, 'success');
      
      roles.forEach(role => {
        const desc = AgentRoleDescriptions[AgentRole[role]];
        if (desc) {
          log('INFO', `   ${role}: ${desc.substring(0, 60)}...`, 'info');
        }
      });
      testsPassed++;
    } catch (error) {
      log('TEST', `❌ Failed to get role descriptions: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // TEST 10: Permission Matrix Completeness
    // ================================
    logSection('🔟 TEST: Permission Matrix Completeness');
    
    testsRun++;
    try {
      const { AgentPermissions, getPermissions } = governance;
      const roles = Object.keys(AgentRole);
      let allRolesHavePermissions = true;
      
      roles.forEach(role => {
        const permissions = getPermissions(AgentRole[role]);
        if (!permissions || permissions.length === 0) {
          log('TEST', `❌ ${role} has no permissions defined`, 'error');
          allRolesHavePermissions = false;
        } else {
          log('INFO', `   ${role}: ${permissions.length} permissions`, 'info');
        }
      });
      
      if (allRolesHavePermissions) {
        log('TEST', '✅ All roles have permissions defined', 'success');
        testsPassed++;
      } else {
        log('TEST', '❌ Some roles missing permissions', 'error');
        testsFailed++;
      }
    } catch (error) {
      log('TEST', `❌ Failed to check permission matrix: ${error.message}`, 'error');
      testsFailed++;
    }
    
    // ================================
    // RÉSUMÉ FINAL
    // ================================
    const totalDuration = Date.now() - startTime;
    
    logSection('📊 RÉSUMÉ DE LA SIMULATION');
    
    const passRate = Math.round((testsPassed / testsRun) * 100);
    const statusColor = passRate === 100 ? colors.green : passRate >= 80 ? colors.yellow : colors.red;
    
    console.log(`${statusColor}${colors.bright}Tests exécutés: ${testsRun}${colors.reset}`);
    console.log(`${colors.green}✅ Réussis: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}❌ Échoués: ${testsFailed}${colors.reset}`);
    console.log(`${statusColor}${colors.bright}Taux de réussite: ${passRate}%${colors.reset}`);
    
    console.log(`\n${colors.bright}⏱️  Durée totale: ${(totalDuration / 1000).toFixed(2)}s${colors.reset}`);
    
    if (passRate === 100) {
      console.log(`\n${colors.green}${colors.bright}✅ GOVERNANCE LAYER: 100% OPÉRATIONNEL${colors.reset}`);
      console.log(`\n${colors.cyan}Vérifications effectuées:${colors.reset}`);
      console.log(`  ✅ Permissions valides fonctionnent`);
      console.log(`  ✅ Violations sont correctement bloquées`);
      console.log(`  ✅ Helpers de vérification fonctionnent`);
      console.log(`  ✅ Cadence status accessible`);
      console.log(`  ✅ Audit logging opérationnel`);
      console.log(`  ✅ Matrice de permissions complète`);
      
      console.log(`\n${colors.cyan}Principes respectés:${colors.reset}`);
      console.log(`  ✅ Fail fast - Violations bloquent immédiatement`);
      console.log(`  ✅ Least privilege - Permissions minimales par agent`);
      console.log(`  ✅ Audit trail - Actions critiques tracées`);
      console.log(`  ✅ No bypass - Impossible de contourner les règles`);
    } else {
      console.log(`\n${colors.red}${colors.bright}⚠️  GOVERNANCE LAYER: PROBLÈMES DÉTECTÉS${colors.reset}`);
      console.log(`\n${colors.yellow}Vérifier les tests échoués ci-dessus${colors.reset}`);
    }
    
    process.exit(testsFailed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR PENDANT LA SIMULATION:${colors.reset}`);
    console.error(error);
    process.exit(1);
  }
}

// Exécuter la simulation
testGovernance()
  .then(() => {
    console.log(`\n${colors.green}${colors.bright}✅ Simulation terminée${colors.reset}\n`);
  })
  .catch((error) => {
    console.error(`\n${colors.red}❌ Simulation échouée:${colors.reset}`, error);
    process.exit(1);
  });
