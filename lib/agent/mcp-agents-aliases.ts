// MCP Agents Aliases - Clean, optimized exports only
// Professional architecture with verified imports

// Pipeline V2 - Core pipeline functions (verified exports)
export {
  scout,
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

// Analyst Multipass V3 (correct export name)
export {
  analystAgentV3,
} from './analyst-multipass';

// Auto Publisher
export {
  autoPublisher,
  runAutoPublisher,
  runStrategicAutoPublisher,
  dryRunAutoPublisher,
} from './auto-publisher';

// Cadence Enforcer
export {
  cadenceEnforcer,
} from './cadence-enforcer';

// Critical Loop V2
export {
  runCriticalLoopV2,
} from './critical-loop-v2';

// Orchestrator (correct source for assessment functions)
export {
  assessAfterScout,
  assessAfterReader,
  assessAfterAnalyst,
  assessAfterCriticalLoop,
  createPipelineState,
  recordDecision,
  generateExpandedTerms,
  loadCalibratedThresholds,
} from './orchestrator';

// Query Enhancement
export {
  enhanceQuery,
  generateSearchQueries,
} from './query-enhancer';

// Evidence Grader (real implementation in review-board.ts)
export {
  gradeEvidence,
} from './review-board';

// Citation Verifier
export {
  verifyCitations,
  extractCitations,
} from './citation-verifier';

// Semantic Engine
export {
  embedText,
  embedBatch,
  embedSource,
  embedSourcesBatch,
  semanticSearch,
  filterByRelevanceHybrid,
  backfillEmbeddings,
  getEmbeddingStats,
} from './semantic-engine';

// Devil's Advocate
export {
  runDevilsAdvocate,
} from './devils-advocate';

// Debate Agent
export {
  debateAgent,
} from './debate-agent';

// Meta Analysis Engine
export {
  metaAnalysisEngine,
} from './meta-analysis-engine';

// Researcher Identity
export {
  buildResearcherProfile,
  storeResearcherPosition,
  storePrediction,
  storeExpertAnalysisMemory,
  detectPositionEvolution,
} from './researcher-identity';

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

// Strategic Report Renderer
export {
  renderStrategicReportHTML,
} from './strategic-report-renderer';

// Domain Classifier - Now includes domain detection
export {
  classifySourceDomains,
  classifyBatchSources,
  classifyUnclassifiedSources,
} from './domain-classifier';

// Domain Detection Utility
export {
  detectDomain,
  detectMultipleDomains,
  quickDomainDetection,
  isValidDomain,
  getAllDomains,
  getDomainKeywords,
} from './domain-detection';

// Editorial Gate
export {
  editorialGate,
  evaluatePendingSignals,
  submitDraftToGate,
} from './editorial-gate';

// Editorial Planner
export {
  planEditorialAgenda,
} from './editorial-planner';

// Context Primer
export {
  primeContext,
} from './context-primer';

// Prediction Auditor
export {
  runPredictionAuditor,
} from './prediction-auditor';

// Knowledge Graph - Now includes all missing functions
export {
  extractAndStoreConcepts,
  queryKnowledgeGraph,
  getLongitudinalInsights,
} from './knowledge-graph';

// Google Knowledge Graph Integrations
export {
  searchKnowledgeGraph,
  enrichWithKnowledgeGraph,
  batchEnrichEntities,
  validateInstitution,
  validatePerson,
} from './knowledge-graph-integrations';

// Radar Agent
export {
  generateRadarCards,
  getMacroContext,
} from './radar-agent';

// Macro Series Manager - Professional implementation
export {
  refreshMacroSeries,
  getMacroSeriesHealth,
  upsertMacroSeries,
  getMacroDataForAnalysis,
} from './macro-series-manager';

// Omega Verification
export {
  omegaVerificationEngine,
} from './omega-verification';

// Extended Provider Registry - Corrected import path
export {
  searchExtendedProviders,
  getExtendedProvidersForDomain,
} from '../providers/registry-bridge';

// Harvard Council Enhanced
export {
  runEnhancedHarvardCouncil,
  selectDomainLeads,
  runLoadBalancedCouncil,
  analyzeInterdisciplinary,
  runEnhancedSynthesis,
  calculateCouncilMetrics,
  type CouncilConfig,
  type EnhancedSynthesisReport,
  type CouncilMetrics,
} from './harvard-council-enhanced';

// Smart Provider Selector
export {
  selectSmartProviders,
} from './smart-provider-selector';

// Signal Detector (if exists)
export {
  signalDetector,
} from './signal-detector';

// Trend Analyzer (if exists) 
export {
  trendAnalyzer,
} from './trend-analyzer';

// Contradiction Detector (if exists)
export {
  contradictionDetector,
} from './contradiction-detector';

// Publication Generator (if exists)
export {
  generatePublication,
} from './publication-generator';

// Unified Topic Classifier (V9)
export {
  classifyTopic,
  classifyTopicSync,
  classifyVerticalUnified,
  detectDomainUnified,
  getPrimaryResearcherUnified,
  getProvidersForTopic,
} from './topic-classifier';

// Master Orchestrator (V9)
export {
  orchestrate,
  signalToEvent,
  newsToEvents,
  alertToEvent,
  paperToEvent,
} from './master-orchestrator';

// Researcher Knowledge Bases (V9)
export {
  getResearcherKB,
  buildKBInjection,
  getResearcherDataSources,
  getAllKBs,
} from './researcher-kb';