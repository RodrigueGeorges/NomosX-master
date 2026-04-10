# NomosX Vertical Intelligence System

## Overview

The Vertical Intelligence System replaces the generic auto-publisher with PhD expert-driven vertical research. Each vertical is led by domain experts who actively discover innovative topics and conduct original research.

## Architecture

### Core Components

1. **VerticalIntelligenceEngine** - Discovers innovative topics using competitive intelligence
2. **ExpertLedResearchManager** - Conducts original research led by PhD experts  
3. **VerticalOrchestrator** - Coordinates complete research cycles
4. **VerticalPublisher** - Integration layer for publication
5. **HybridPublisher** - Backward compatibility with existing auto-publisher

### Workflow

```
PhD Expert (per vertical)
    ↓
Competitive Intelligence Gathering
    ↓
Innovative Topic Discovery
    ↓
Research Project Initiation
    ↓
Specialized Sourcing
    ↓
Expert Analysis (Multi-domain)
    ↓
Original Research Synthesis
    ↓
Quality Validation (Devil's Advocate)
    ↓
Publication Generation
```

## Key Features

### Expert-Driven Research
- Each vertical has a lead PhD researcher
- Supporting experts provide multi-domain analysis
- Original contribution statements, not summaries
- Competitive advantage identification

### Specialized Sourcing
- Domain-specific providers per vertical
- Specialized queries for cutting-edge sources
- Quality thresholds higher than generic system
- Temporal and geographic targeting

### Innovation Scoring
- Innovation potential (0-100)
- Expert confidence (0-100)  
- Market impact assessment
- Competitive gap analysis

### Quality Gates
- Minimum innovation score: 70
- Minimum expert confidence: 60
- Minimum source quality: 75
- Minimum originality score: 65

## Vertical Configurations

### Climate & Industry
- **Lead Expert**: Dr. Kenji Tanaka (Climate Science, ETH Zurich)
- **Specialized Providers**: IPCC, MIT Climate Lab, Nature Climate, IEA
- **Focus Areas**: Carbon capture, climate finance, industrial decarbonization

### AI & Labor  
- **Lead Expert**: Dr. James Chen (AI/ML, Stanford)
- **Specialized Providers**: arXiv AI, NeurIPS, OpenAI Research, DeepMind
- **Focus Areas**: AI impact on employment, automation economics, skill evolution

### EU Policy
- **Lead Expert**: Dr. Amara Okafor (Public Policy, Oxford)
- **Specialized Providers**: EU Commission, Bruegel, CEPS, Chatham House
- **Focus Areas**: EU regulations, digital policy, green deal implementation

### Geopolitics
- **Lead Expert**: Dr. Marcus Webb (Strategic Security, Georgetown)
- **Specialized Providers**: RAND, CSIS, CFR, IISS
- **Focus Areas**: International relations, security dynamics, diplomatic trends

### Finance & Regulation
- **Lead Expert**: Dr. Priya Sharma (Quantitative Methods, Harvard)
- **Specialized Providers**: BIS, Federal Reserve, SEC filings, ECB
- **Focus Areas**: Financial stability, digital currencies, market regulation

## Usage

### Basic Usage
```typescript
import { runVerticalPublisher } from '@/lib/agent/vertical-intelligence';

const result = await runVerticalPublisher({
  verticalSlugs: ['climate-industry', 'ai-labor'],
  maxCostPerRun: 50,
  enableQualityGates: true
});

console.log(`Generated ${result.totalPublications} publications`);
console.log(`Average innovation score: ${result.summary.averageInnovationScore}`);
```

### Single Vertical
```typescript
import { verticalOrchestrator } from '@/lib/agent/vertical-intelligence';

const result = await verticalOrchestrator.runVerticalIntelligenceCycle('climate-industry');
```

### Hybrid Mode (Backward Compatibility)
```typescript
import { runHybridPublisher } from '@/lib/agent/vertical-intelligence';

const result = await runHybridPublisher({
  enableVerticalIntelligence: true,
  priorityMode: 'vertical-first',
  enableFallback: true
});
```

## Integration with Existing System

### Cron Integration
```typescript
// app/api/cron/vertical-intelligence/route.ts
import { runVerticalPublisher } from '@/lib/agent/vertical-intelligence';

export async function POST() {
  const result = await runVerticalPublisher({
    verticalSlugs: ['climate-industry', 'ai-labor', 'eu-policy'],
    maxCostPerRun: 100
  });
  
  return NextResponse.json(result);
}
```

### Database Schema
The system requires additional tables:
- `InnovativeTopic` - Stores discovered topics
- `ResearchProject` - Tracks research projects
- `ResearchFinding` - Individual expert findings

## Performance Metrics

### Innovation Metrics
- **Innovation Score**: Novelty of hypothesis and methodology
- **Originality Score**: Uniqueness vs existing literature
- **Competitive Advantage**: Why we're better positioned

### Quality Metrics  
- **Expert Confidence**: Alignment with expert domains
- **Source Quality**: Specialized provider quality scores
- **Validation Score**: Devil's Advocate challenge results

### Cost Metrics
- **Topic Discovery**: $2.50 per topic
- **Research Execution**: $8.00 per project
- **Publication Generation**: $1.00 per publication
- **Quality Validation**: $0.50 per publication

## Comparison with Auto-Publisher

| Feature | Auto-Publisher | Vertical Intelligence |
|---------|----------------|---------------------|
| Topic Discovery | Reactive (signal-based) | Proactive (expert-led) |
| Research Approach | Generic templates | Original research |
| Source Selection | Smart but generic | Specialized per vertical |
| Expert Involvement | Optional review | Lead researchers |
| Innovation Focus | Summarize existing | Create new knowledge |
| Quality Standards | Institutional-grade | Academic-grade |
| Cost per Publication | ~$3-5 | ~$12-15 |
| Originality Score | 40-60 | 70-90 |

## Migration Path

### Phase 1: Parallel Operation
- Run both systems in parallel
- Compare performance metrics
- Identify best-performing verticals

### Phase 2: Gradual Migration  
- Switch high-performing verticals to intelligence system
- Maintain fallback to auto-publisher
- Monitor quality and cost metrics

### Phase 3: Full Migration
- Complete transition to vertical intelligence
- Retire generic auto-publisher
- Optimize based on performance data

## Future Enhancements

### Advanced Features
- Real-time competitive monitoring
- Predictive topic discovery  
- Cross-vertical collaboration
- Automated peer review integration

### Scaling
- Additional verticals (health, defense, technology)
- Regional specializations (Asia, Africa, LatAm)
- Language capabilities (French, German, Chinese)
- Industry partnerships

### Performance Optimization
- Caching of competitive intelligence
- Parallel research execution
- Cost optimization algorithms
- Quality prediction models
