/**
 * NomosX VERTICAL INTELLIGENCE SYSTEM
 * 
 * Expert-driven vertical research system
 * Replaces generic auto-publisher with PhD-led innovation
 * 
 * Architecture:
 * 1. VerticalIntelligenceEngine - Discover innovative topics
 * 2. ExpertLedResearchManager - Conduct original research  
 * 3. VerticalOrchestrator - Coordinate complete cycle
 */

// Core exports
export {
  VerticalIntelligenceEngine,
  verticalIntelligenceEngine,
  type InnovativeTopic,
  type CompetitiveIntelligence,
  type VerticalIntelligenceConfig
} from './vertical-intelligence-engine';

export {
  ExpertLedResearchManager,
  expertLedResearchManager,
  type ResearchProject,
  type ResearchFinding,
  type ResearchSourcing
} from './expert-led-research';

import { verticalOrchestrator } from './vertical-orchestrator';

export {
  VerticalOrchestrator,
  verticalOrchestrator,
  type VerticalOrchestrationConfig,
  type VerticalOrchestrationResult
} from './vertical-orchestrator';

// Convenience exports for backward compatibility
export const runVerticalIntelligence = (config: any) => verticalOrchestrator.runVerticalIntelligenceCycle(config);
