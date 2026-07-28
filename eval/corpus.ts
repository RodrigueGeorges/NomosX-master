/**
 * NomosX Eval Corpus — 5 topics figés couvrant les modes de défaillance.
 *
 * Chaque topic déclare son mode attendu pour refusalCorrectness.
 * Aucun LLM ne participe au scoring — tout est déterministe.
 */

export type ExpectedMode =
  | "abundant_data" // doit atteindre un ancrage élevé
  | "nonexistent_data" // doit REFUSER, pas fabriquer
  | "multi_mechanism" // doit couvrir tous les canaux
  | "deictic_unresolved" // doit aborter
  | "regression_baseline"; // baseline de régression

export interface CorpusTopic {
  id: string;
  question: string;
  depth: "standard" | "deep" | "strategic";
  expectedMode: ExpectedMode;
  /** For refusalCorrectness: should the pipeline refuse (held/draft) or publish? */
  shouldRefuse: boolean;
  /** Expected min groundingRate (only for abundant_data / regression_baseline) */
  minGroundingRate?: number;
  /** Expected min primarySourceRatio */
  minPrimarySourceRatio?: number;
}

export const CORPUS: CorpusTopic[] = [
  {
    id: "topic-1-carbon-pricing",
    question:
      "What is the economic impact of carbon pricing on EU industry competitiveness?",
    depth: "deep",
    expectedMode: "abundant_data",
    shouldRefuse: false,
    minGroundingRate: 0.7,
    minPrimarySourceRatio: 0.5,
  },
  {
    id: "topic-2-lithium-reserves",
    question:
      "What is the exact lithium reserves tonnage in the Democratic Republic of Congo as of 2024?",
    depth: "deep",
    expectedMode: "nonexistent_data",
    shouldRefuse: true,
  },
  {
    id: "topic-3-multi-mechanism",
    question:
      "How do US sanctions against Russia affect global energy markets, financial systems, and agricultural trade?",
    depth: "strategic",
    expectedMode: "multi_mechanism",
    shouldRefuse: false,
    minGroundingRate: 0.6,
    minPrimarySourceRatio: 0.4,
  },
  {
    id: "topic-4-deictic",
    question: "What are the latest developments in quantum computing?",
    depth: "standard",
    expectedMode: "deictic_unresolved",
    shouldRefuse: true,
  },
  {
    id: "topic-5-regression",
    question:
      "How do the latest US sanctions against Russia influence the strategic alignment of Global South countries?",
    depth: "strategic",
    expectedMode: "regression_baseline",
    shouldRefuse: false,
    minGroundingRate: 0.6,
    minPrimarySourceRatio: 0.4,
  },
];
