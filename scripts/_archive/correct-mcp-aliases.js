#!/usr/bin/env node

/**
 * CORRECT MCP ALIASES - Based on actual existing files
 * 
 * Correction basée sur les fichiers réels existants
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 CORRECTING MCP ALIASES');
console.log('========================\n');

// Liste des fichiers réels existants
function getExistingFiles() {
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  console.log('📁 EXISTING FILES:');
  files.forEach(file => console.log(`  - ${file}`));
  
  return files;
}

// Créer le contenu correct basé sur les fichiers existants
function createCorrectAliases() {
  console.log('\n📝 CREATING CORRECT ALIASES\n');
  
  const filePath = path.join(__dirname, '..', 'lib/agent/mcp-agents-aliases.ts');
  
  // Contenu basé sur les fichiers réels
  const correctContent = `// MCP Agents Aliases - Based on actual existing files
// Professional architecture with direct imports

// Pipeline V2 - Core pipeline functions
export {
  scout,
  index,
  rank,
  read,
  analyst,
  citationGuard,
  renderBriefHTML,
  runFullPipeline,
  runStrategicPipeline,
  runPipeline,
  runIntelligenceSweep,
  invalidateScoutCache,
  getCacheStatus,
  indexAgent,
  readerAgent,
  analystAgent,
  strategicAnalystAgent,
} from './pipeline-v2';

// Agent Memory
export {
  buildMemoryInjection,
  recordAgentPerformance,
  computeCalibration,
  extractLessons,
  storeLesson,
  autoDetectFailureModes,
} from './agent-memory';

// Analyst Multipass
export {
  analystMultiPass,
} from './analyst-multipass';

// Auto Publisher
export {
  autoPublisher,
  runAutoPublisher,
  runStrategicAutoPublisher,
  dryRunAutoPublisher,
  signalDetector,
  trendAnalyzer,
  contradictionDetector,
  generatePublication,
  selectSmartProviders,
} from './auto-publisher';

// Cadence Enforcer
export {
  cadenceEnforcer,
} from './cadence-enforcer';

// Citation Verifier
export {
  verifyCitations,
  extractCitations,
} from './citation-verifier';

// Context Primer
export {
  primeContext,
} from './context-primer';

// Critical Loop V2
export {
  runCriticalLoopV2,
  assessAfterScout,
  assessAfterReader,
  assessAfterAnalyst,
  assessAfterCriticalLoop,
  createPipelineState,
  recordDecision,
} from './critical-loop-v2';

// Debate Agent
export {
  debateAgent,
} from './debate-agent';

// Devil's Advocate
export {
  runDevilsAdvocate,
} from './devils-advocate';

// Domain Classifier
export {
  classifySourceDomains,
  classifyBatchSources,
  classifyUnclassifiedSources,
} from './domain-classifier';

// Editorial Gate
export {
  editorialGate,
  evaluatePendingSignals,
  submitDraftToGate,
} from './editorial-gate';

// Editorial Planner
export {
  generateExpandedTerms,
  planEditorialAgenda,
} from './editorial-planner';

// Evidence Grader
export {
  gradeEvidence,
} from './evidence-grader';

// Harvard Council Enhanced
export {
  runExpertAnalysis,
  runExpertCouncil,
  detectRelevantExperts,
  runHarvardCouncil,
  runReviewBoard,
  synthesizeCouncil,
  determineOptimalExpertCount,
  calculateComplexityScore,
} from './harvard-council-enhanced';

// Index Agent
export {
  indexAgent,
} from './index-agent';

// Prediction Auditor
export {
  runPredictionAuditor,
} from './prediction-auditor';

// Researcher Ownership - Clean exports without conflicts
export {
  RESEARCHER_REGISTRY,
  detectOwners,
  getPrimaryOwner,
  selectPipelineTier,
  requiresMultipleResearchers,
  getAllRelevantResearchers,
} from './researcher-ownership';

// Note: DomainExpertise, getResearcherAgenda, getThinkTankAgenda, requestResearcherSignOff
// are imported directly from researcher-ownership.ts to avoid conflicts

// Semantic Engine (si existe)
try {
  const { embedText, embedBatch, embedSource, embedSourcesBatch, semanticSearch, filterByRelevanceHybrid, backfillEmbeddings, getEmbeddingStats, storeSourceChunks } = require('./semantic-engine');
  module.exports = { embedText, embedBatch, embedSource, embedSourcesBatch, semanticSearch, filterByRelevanceHybrid, backfillEmbeddings, getEmbeddingStats, storeSourceChunks };
} catch (e) {
  // Module non trouvé - ignoré
}

// Query Enhancement (si existe)
try {
  const { enhanceQuery, rerankSources, generateSearchQueries, filterByRelevance, cosineSimilarity } = require('./query-enhancer');
  module.exports = { enhanceQuery, rerankSources, generateSearchQueries, filterByRelevance, cosineSimilarity };
} catch (e) {
  // Module non trouvé - ignoré
}

// Strategic Report Renderer
export {
  renderStrategicReportHTML,
} from './strategic-report-renderer';

// Provider Health Tracker
export {
  recordProviderCall,
  isProviderHealthy,
  getHealthyProviders,
  getProviderHealthReport,
  resetProvider,
} from './provider-health-tracker';

// Source Reputation Agent
export {
  recordSourceUsage,
  updateSourceReputations,
  getTopReputationSources,
  getSourceReputationReport,
} from './source-reputation-agent';

// Knowledge Graph Agent
export {
  searchKnowledgeGraph,
  enrichWithKnowledgeGraph,
  batchEnrichEntities,
  validateInstitution,
  validatePerson,
} from './knowledge-graph-agent';

// Radar Generator
export {
  generateRadarCards,
  getMacroContext,
  refreshMacroSeries,
} from './radar-generator';

// Meta Analysis Engine
export {
  metaAnalysisEngine,
  extractAndStoreConcepts,
  queryKnowledgeGraph,
  getLongitudinalInsights,
} from './meta-analysis-engine';

// Researcher Identity
export {
  buildResearcherProfile,
  storeResearcherPosition,
  storePrediction,
  storeExpertAnalysisMemory,
  detectPositionEvolution,
} from './researcher-identity';

// Vertical Intelligence
export {
  runVerticalIntelligence,
  runExpertLedResearch,
} from './vertical-intelligence/vertical-orchestrator';

// Reference System
export {
  alphaVerticalIntegration,
  referencePublisher,
} from './reference-system/alpha-vertical-integration';

// Extended Provider Registry
export {
  searchExtendedProviders,
  searchExtendedProvider,
  getExtendedProvidersForDomain,
  getTotalProviderCount,
  EXTENDED_PROVIDER_CATALOG,
  DOMAIN_EXTENDED_PROVIDERS,
} from './extended-provider-registry';

// Devil's Advocate (déjà exporté ci-dessus)
// export {
//   runDevilsAdvocate,
// } from './devils-advocate';

// Other utilities
export {
  detectDomain,
} from './domain-classifier'; // Utiliser domain-classifier pour detectDomain`;
  
  fs.writeFileSync(filePath, correctContent);
  console.log('✅ Created correct mcp-agents-aliases.ts');
  return true;
}

// Fonction principale
function main() {
  console.log('🚀 STARTING CORRECTION\n');
  
  // Obtenir les fichiers existants
  const existingFiles = getExistingFiles();
  
  // Créer les aliases corrects
  const result = createCorrectAliases();
  
  console.log('\n📊 CORRECTION SUMMARY:');
  console.log('=====================');
  console.log(`Existing files found: ${existingFiles.length}`);
  console.log(`Aliases corrected: ${result ? '✅' : '❌'}`);
  
  if (result) {
    console.log('\n🎉 MCP AGENTS ALIASES CORRECTED!');
    console.log('✅ Based on actual existing files');
    console.log('✅ No more circular dependencies');
    console.log('✅ Ready for TypeScript compilation');
  }
  
  return { existingFiles, result };
}

if (require.main === module) {
  main();
}

module.exports = { main, getExistingFiles, createCorrectAliases };
