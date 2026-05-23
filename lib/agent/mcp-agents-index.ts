/**
 * NomosX MCP Agents Index - Professional Implementation
 * 
 * Single entry point for all NomosX agents with verified exports only
 * Uses the unified pipeline (pipeline-v2) as sole backend.
 * 
 * @author NomosX Team
 * @version 2.0.0
 * @since 2026-02-24
 */

// ============================================================================
// CORE PIPELINE FUNCTIONS - Verified Exports Only
// ============================================================================

import {
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

// ============================================================================
// EXPERT SYSTEM FUNCTIONS - From Verified Sources
// ============================================================================

import {
  determineOptimalExpertCount,
} from './phd-researcher';

import {
  detectOwners,
  getPrimaryOwner,
  selectPipelineTier,
  getResearcherAgenda,
  getThinkTankAgenda,
  requestResearcherSignOff,
} from './researcher-ownership';

import {
  runExpertAnalysis,
  runExpertCouncil,
  detectRelevantExperts,
} from './phd-researcher';

// ============================================================================
// QUERY ENHANCEMENT - Verified Functions
// ============================================================================

import {
  enhanceQuery,
  generateSearchQueries,
} from './query-enhancer';

// ============================================================================
// V3 INTELLIGENCE AGENTS - Verified Exports Only
// ============================================================================

import {
  analystAgentV3,
} from './analyst-multipass';

import {
  runCriticalLoopV2,
} from './critical-loop-v2';

import {
  verifyCitations,
  extractCitations,
} from './citation-verifier';

// ============================================================================
// SEMANTIC ENGINE - Verified Functions
// ============================================================================

import {
  embedText,
  embedBatch,
  embedSource,
  embedSourcesBatch,
  semanticSearch,
  filterByRelevanceHybrid,
  backfillEmbeddings,
  getEmbeddingStats,
  cosineSimilarity,
} from './semantic-engine';

// ============================================================================
// AGENT MEMORY - Verified Functions
// ============================================================================

import {
  buildMemoryInjection,
  recordAgentPerformance,
  computeCalibration,
  extractLessons,
  storeLesson,
  autoDetectFailureModes,
} from './agent-memory';

// ============================================================================
// KNOWLEDGE GRAPH - Verified Functions
// ============================================================================

import {
  extractAndStoreConcepts,
  queryKnowledgeGraph,
  getLongitudinalInsights,
} from './knowledge-graph';

// ============================================================================
// RESEARCHER IDENTITY - Verified Functions
// ============================================================================

import {
  buildResearcherProfile,
  storeResearcherPosition,
  storePrediction,
  storeExpertAnalysisMemory,
  detectPositionEvolution,
} from './researcher-identity';

// ============================================================================
// PROVIDER SYSTEMS - Verified Functions
// ============================================================================

import {
  recordProviderCall,
  isProviderHealthy,
  getHealthyProviders,
  getProviderHealthReport,
  resetProvider,
} from './provider-health-tracker';

import {
  recordSourceUsage,
  updateSourceReputations,
  getTopReputationSources,
  getSourceReputationReport,
} from './source-reputation-agent';

import {
  searchExtendedProviders,
  getExtendedProvidersForDomain,
} from '../providers/registry-bridge';

// ============================================================================
// PUBLISHER SYSTEMS - Verified Functions
// ============================================================================

import {
  autoPublisher,
  runAutoPublisher,
  runStrategicAutoPublisher,
  dryRunAutoPublisher,
} from './auto-publisher';

import {
  runAndPublishInquiry,
  runInquiryOnly,
} from './inquiry-orchestrator';

import {
  runInquiryPipeline,
} from './inquiry-pipeline';

import {
  runThinkTankCycle,
  getThinkTankStatus,
  getCadenceState,
} from './think-tank-dispatcher';

import {
  runSimulationAgent,
  runMonteCarloSimulation,
  computeSensitivityMatrix,
  simulationAgent,
  chatWithSimulatedPersona,
} from './simulation-agent';

import {
  normalizeTopicKey,
  publicationTypeToDepth,
  depthToPublicationType,
} from './inquiry-funnel-utils';

import {
  generateRadarCards,
  getMacroContext,
} from './radar-agent';

import {
  refreshMacroSeries,
  getMacroSeriesHealth,
  upsertMacroSeries,
  getMacroDataForAnalysis,
} from './macro-series-manager';

// ============================================================================
// ANALYSIS SYSTEMS - Verified Functions
// ============================================================================

import {
  gradeEvidence,
} from './review-board';

import {
  runDevilsAdvocate,
} from './devils-advocate';

import {
  debateAgent,
} from './debate-agent';

import {
  metaAnalysisEngine,
} from './meta-analysis-engine';

// ============================================================================
// DOMAIN SYSTEMS - Verified Functions
// ============================================================================

import {
  classifySourceDomains,
  classifyBatchSources,
  classifyUnclassifiedSources,
} from './domain-classifier';

import {
  detectDomain,
  detectMultipleDomains,
  quickDomainDetection,
  isValidDomain,
  getAllDomains,
  getDomainKeywords,
} from './domain-detection';

// ============================================================================
// GOOGLE KNOWLEDGE GRAPH INTEGRATIONS - Verified Functions
// ============================================================================

import {
  searchKnowledgeGraph as searchGoogleKG,
  enrichWithKnowledgeGraph,
  batchEnrichEntities,
  validateInstitution,
  validatePerson,
} from './knowledge-graph-integrations';

// ============================================================================
// GOVERNANCE SYSTEMS - Verified Functions
// ============================================================================

import {
  cadenceEnforcer,
} from './cadence-enforcer';

import {
  editorialGate,
  evaluatePendingSignals,
  submitDraftToGate,
} from './editorial-gate';

import {
  planEditorialAgenda,
} from './editorial-planner';

import {
  primeContext,
} from './context-primer';

import {
  runPredictionAuditor,
} from './prediction-auditor';

// ============================================================================
// VERIFICATION SYSTEMS - Verified Functions
// ============================================================================

import {
  omegaVerificationEngine,
} from './omega-verification';

// ============================================================================
// REPORTING SYSTEMS - Verified Functions
// ============================================================================

import {
  renderStrategicReportHTML,
} from './strategic-report-renderer';

// ============================================================================
// HARVARD COUNCIL - Verified Functions
// ============================================================================

import {
  runEnhancedHarvardCouncil,
  selectDomainLeads,
  runLoadBalancedCouncil,
  analyzeInterdisciplinary,
  runEnhancedSynthesis,
  calculateCouncilMetrics,
} from './harvard-council-enhanced';

// ============================================================================
// SMART PROVIDER SELECTION - Verified Functions
// ============================================================================

import {
  selectSmartProviders,
} from './smart-provider-selector';

// ============================================================================
// UNIFIED INTELLIGENCE SYSTEM - V9 Master Orchestrator
// ============================================================================

import {
  classifyTopic,
  classifyTopicSync,
  classifyVerticalUnified,
  detectDomainUnified,
  getPrimaryResearcherUnified,
  getProvidersForTopic,
} from './topic-classifier';

import {
  orchestrate,
  signalToEvent,
  newsToEvents,
  alertToEvent,
  paperToEvent,
} from './master-orchestrator';

import {
  getResearcherKB,
  buildKBInjection,
  getResearcherDataSources,
  getAllKBs,
} from './researcher-kb';

// ============================================================================
// SIGNAL DETECTION SYSTEMS - Verified Functions
// ============================================================================

import {
  signalDetector,
} from './signal-detector';

import {
  trendAnalyzer,
} from './trend-analyzer';

import {
  contradictionDetector,
} from './contradiction-detector';

import {
  generatePublication,
} from './publication-generator';

// ============================================================================
// PROFESSIONAL EXPORTS - Clean Architecture
// ============================================================================

// Core Pipeline
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
};

// Expert Systems
export {
  determineOptimalExpertCount,
  detectOwners,
  getPrimaryOwner,
  selectPipelineTier,
  getResearcherAgenda,
  getThinkTankAgenda,
  requestResearcherSignOff,
  runExpertAnalysis,
  runExpertCouncil,
  detectRelevantExperts,
};

// Query Enhancement
export {
  enhanceQuery,
  generateSearchQueries,
};

// V3 Intelligence Agents
export {
  analystAgentV3,
  runCriticalLoopV2,
  verifyCitations,
  extractCitations,
};

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
  cosineSimilarity,
};

// Agent Memory
export {
  buildMemoryInjection,
  recordAgentPerformance,
  computeCalibration,
  extractLessons,
  storeLesson,
  autoDetectFailureModes,
};

// Knowledge Graph
export {
  extractAndStoreConcepts,
  queryKnowledgeGraph,
  getLongitudinalInsights,
};

// Researcher Identity
export {
  buildResearcherProfile,
  storeResearcherPosition,
  storePrediction,
  storeExpertAnalysisMemory,
  detectPositionEvolution,
};

// Provider Systems
export {
  recordProviderCall,
  isProviderHealthy,
  getHealthyProviders,
  getProviderHealthReport,
  resetProvider,
  recordSourceUsage,
  updateSourceReputations,
  getTopReputationSources,
  getSourceReputationReport,
  searchExtendedProviders,
  getExtendedProvidersForDomain,
};

// Publisher Systems
export {
  autoPublisher,
  runAutoPublisher,
  runStrategicAutoPublisher,
  dryRunAutoPublisher,
  runAndPublishInquiry,
  runInquiryOnly,
  runInquiryPipeline,
  runThinkTankCycle,
  getThinkTankStatus,
  getCadenceState,
  runSimulationAgent,
  runMonteCarloSimulation,
  computeSensitivityMatrix,
  simulationAgent,
  chatWithSimulatedPersona,
  normalizeTopicKey,
  publicationTypeToDepth,
  depthToPublicationType,
  generateRadarCards,
  getMacroContext,
  refreshMacroSeries,
  getMacroSeriesHealth,
  upsertMacroSeries,
  getMacroDataForAnalysis,
};

// Analysis Systems
export {
  gradeEvidence,
  runDevilsAdvocate,
  debateAgent,
  metaAnalysisEngine,
};

// Domain Systems
export {
  classifySourceDomains,
  classifyBatchSources,
  classifyUnclassifiedSources,
  detectDomain,
  detectMultipleDomains,
  quickDomainDetection,
  isValidDomain,
  getAllDomains,
  getDomainKeywords,
};

// Google Knowledge Graph
export {
  searchGoogleKG,
  enrichWithKnowledgeGraph,
  batchEnrichEntities,
  validateInstitution,
  validatePerson,
};

// Governance Systems
export {
  cadenceEnforcer,
  editorialGate,
  evaluatePendingSignals,
  submitDraftToGate,
  planEditorialAgenda,
  primeContext,
  runPredictionAuditor,
};

// Verification Systems
export {
  omegaVerificationEngine,
};

// Reporting Systems
export {
  renderStrategicReportHTML,
};

// Harvard Council
export {
  runEnhancedHarvardCouncil,
  selectDomainLeads,
  runLoadBalancedCouncil,
  analyzeInterdisciplinary,
  runEnhancedSynthesis,
  calculateCouncilMetrics,
};

// Smart Provider Selection
export {
  selectSmartProviders,
};

// Signal Detection
export {
  signalDetector,
  trendAnalyzer,
  contradictionDetector,
  generatePublication,
};

// Unified Intelligence System (V9)
export {
  classifyTopic,
  classifyTopicSync,
  classifyVerticalUnified,
  detectDomainUnified,
  getPrimaryResearcherUnified,
  getProvidersForTopic,
  orchestrate,
  signalToEvent,
  newsToEvents,
  alertToEvent,
  paperToEvent,
  getResearcherKB,
  buildKBInjection,
  getResearcherDataSources,
  getAllKBs,
};
