/**
 * NomosX MCP Agents - Vertical Intelligence System
 * 
 * Model Context Protocol agents for vertical intelligence system
 * Provides integration with existing MCP architecture
 */

// Core vertical intelligence agents
export {
  VerticalIntelligenceEngine,
  verticalIntelligenceEngine,
  type InnovativeTopic,
  type CompetitiveIntelligence,
  type VerticalIntelligenceConfig
} from './vertical-intelligence/vertical-intelligence-engine';

export {
  ExpertLedResearchManager,
  expertLedResearchManager,
  type ResearchProject,
  type ResearchFinding,
  type ResearchSourcing
} from './vertical-intelligence/expert-led-research';

export {
  VerticalOrchestrator,
  verticalOrchestrator,
  type VerticalOrchestrationConfig,
  type VerticalOrchestrationResult
} from './vertical-intelligence/vertical-orchestrator';

export {
  VerticalPublisher,
  verticalPublisher,
  type VerticalPublisherConfig,
  type VerticalPublisherOutput
} from './vertical-intelligence/vertical-publisher';

export {
  HybridPublisher,
  hybridPublisher,
  runHybridPublisher,
  type HybridPublisherConfig,
  type HybridPublisherOutput
} from './vertical-intelligence/integration';

// Convenience exports
import { verticalOrchestrator } from './vertical-intelligence/vertical-orchestrator';
import { expertLedResearchManager } from './vertical-intelligence/expert-led-research';

export const runVerticalIntelligence = verticalOrchestrator.runVerticalIntelligenceCycle.bind(verticalOrchestrator);
export const runExpertLedResearch = expertLedResearchManager.initiateResearchProject.bind(expertLedResearchManager);
