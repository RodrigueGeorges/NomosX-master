/**
 * POST-CRITIC ENRICHMENT — STEP 7c/7d/7e: reflective RAG self-evaluation,
 * cross-model consensus on controversial claims, inter-paper knowledge
 * graph. Three pure readers — distinct stats keys, no shared mutable state
 * → run concurrently (three LLM calls off the critical path).
 */

export interface PostCriticEnrichmentDeps {
  analysis: any;
  topSources: any[];
  stats: Record<string, any>;
  label: string;
  query: string;
  citationUsedCount: number;
}

export async function runPostCriticEnrichment(deps: PostCriticEnrichmentDeps): Promise<void> {
  const { analysis, topSources, stats, label, query, citationUsedCount } = deps;

  await Promise.allSettled([

    // ── STEP 7c: REFLECTIVE RAG — Self-evaluation after ANALYST ──
    (async () => {
      try {
        const { reflectOnPhase, recordFailure } = await import('../cross-model-consensus');
        const analysisSummary = typeof analysis === 'string' ? analysis.slice(0, 2000) : JSON.stringify(analysis).slice(0, 2000);
        const reflection = await reflectOnPhase('analyst', {
          question: query,
          analysisSummary,
          sourceCount: topSources.length,
          citationCount: citationUsedCount,
        });
        stats.reflection = {
          phase: 'analyst',
          quality: reflection.quality,
          score: reflection.score,
          issues: reflection.issues,
          recommendations: reflection.recommendations,
          shouldRetry: reflection.shouldRetry,
          costUsd: reflection.costUsd,
        };
        console.log(`${label} REFLECTION (analyst): quality=${reflection.quality}, score=${reflection.score}, shouldRetry=${reflection.shouldRetry}`);

        if (reflection.shouldRetry && reflection.issues.length > 0) {
          recordFailure('analyst', 'quality', reflection.issues.join('; '), reflection.retryStrategy || 'retry with feedback', query.slice(0, 50));
        }
      } catch (err) {
        console.warn(`${label} REFLECTION: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
      }
    })(),

    // ── STEP 7d: CROSS-MODEL CONSENSUS — Verify controversial claims with 3 models ──
    // NomosX: Activate crossModelConsensus() for claims that challenge consensus or are controversial.
    // This uses 3 models (GPT-4o-mini, DeepSeek, GLM-4) to verify claims where the analyst may have blind spots.
    (async () => {
      try {
        const { crossModelConsensus } = await import('../cross-model-consensus');
        // Extract controversial claims from the analysis
        const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
        const controversialKeywords = ['challenges', 'contradicts', 'contrary to', 'reconsider', 'paradigm shift', 'unlike previous', 'despite consensus'];
        const hasControversialClaims = controversialKeywords.some(kw => analysisText.toLowerCase().includes(kw));
        if (hasControversialClaims && topSources.length > 0) {
          // Build evidence text from top sources
          const evidenceText = topSources.slice(0, 5).map((s: any) =>
            `Title: ${s.title}\nAbstract: ${(s.abstract || '').slice(0, 500)}`
          ).join('\n---\n');
          // Pick the most controversial-looking claim for cross-model verification
          const sentences = analysisText.split(/[.!?]+/).filter(s => s.length > 50);
          const controversialSentence = sentences.find(s =>
            controversialKeywords.some(kw => s.toLowerCase().includes(kw))
          );
          if (controversialSentence) {
            const claim = controversialSentence.trim().slice(0, 300);
            const consensusResult = await crossModelConsensus(claim, evidenceText);
            stats.crossModelConsensus = {
              claimsVerified: 1,
              agreements: consensusResult.votes.filter(v => v.verdict === 'support').length,
              disagreements: consensusResult.votes.filter(v => v.verdict === 'contradict').length,
              uncertain: consensusResult.votes.filter(v => v.verdict === 'uncertain').length,
              costUsd: consensusResult.costUsd,
            };
            console.log(`${label} CROSS-MODEL CONSENSUS: controversial claim verified | verdict: ${consensusResult.verdict} | agreement: ${Math.round(consensusResult.agreement * 100)}%`);
          }
        }
      } catch (err) {
        console.warn(`${label} CROSS-MODEL CONSENSUS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
      }
    })(),

    // ── STEP 7e: KNOWLEDGE GRAPH — Build inter-paper KG ──
    (async () => {
      try {
        const { buildKnowledgeGraph } = await import('../knowledge-infrastructure');
        const kgSources = topSources.slice(0, 20).map((s: any) => ({
          id: s.id,
          title: s.title || '',
          abstract: s.abstract || '',
        }));
        const { graph, costUsd: kgCost } = await buildKnowledgeGraph(kgSources);
        stats.knowledgeGraph = {
          entities: graph.entities.length,
          relations: graph.relations.length,
          clusters: graph.clusters.length,
          bridges: graph.bridges.length,
          costUsd: kgCost,
        };
        if (graph.entities.length > 0) {
          console.log(`${label} KNOWLEDGE GRAPH: ${graph.entities.length} entities, ${graph.relations.length} relations, ${graph.clusters.length} clusters`);
        }
      } catch (err) {
        console.warn(`${label} KNOWLEDGE GRAPH: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
      }
    })(),
  ]);
}
