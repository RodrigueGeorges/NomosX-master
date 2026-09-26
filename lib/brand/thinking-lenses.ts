/**
 * The nine thinking lenses — public, display-safe copy for the landing prism.
 * Distilled from lib/agent/lenses/lens-knowledge.ts (the operational personas).
 * Pure data: no pipeline imports — safe to bundle on the client.
 */

export interface ThinkingLens {
  id: string;
  /** What this lens IS — a way of knowing, not a job title */
  name: string;
  /** One-line epithet — its intellectual posture */
  epithet: string;
  /** The question it always asks */
  signatureQuestion: string;
  colorHex: string;
}

export const THINKING_LENSES: ThinkingLens[] = [
  {
    id: "core",
    name: "The Scholar",
    epithet: "Reads the entire mainstream — and knows where the consensus sits on thin ice.",
    signatureQuestion: "What does the strongest peer-reviewed evidence actually establish?",
    colorHex: "#6366F1",
  },
  {
    id: "contrarian",
    name: "The Dissenter",
    epithet: "Steelmans the case against the consensus — weighs arguments, not prestige.",
    signatureQuestion: "What is the strongest documented case against the dominant view?",
    colorHex: "#BE123C",
  },
  {
    id: "historical",
    name: "The Historian",
    epithet: "Reads the present as one configuration among many — the longue durée.",
    signatureQuestion: "What is the closest structural precedent — not the most famous one?",
    colorHex: "#B45309",
  },
  {
    id: "cross_domain",
    name: "The Comparatist",
    epithet: "Hunts the same problem solved elsewhere under another name.",
    signatureQuestion: "Which distant field has already solved this shape of problem?",
    colorHex: "#0F766E",
  },
  {
    id: "weak_signal",
    name: "The Scout",
    epithet: "Reads preprints, patents and margins — where the future shows up first.",
    signatureQuestion: "What anomaly keeps appearing that mainstream sources cannot explain?",
    colorHex: "#0EA5E9",
  },
  {
    id: "scenario",
    name: "The Futurist",
    epithet: "Builds branching futures around what could flip the outcome.",
    signatureQuestion: "What are the two or three uncertainties everything hinges on?",
    colorHex: "#7C3AED",
  },
  {
    id: "provocative",
    name: "The Critic",
    epithet: "Asks not whether the answer is right — but who framed the question.",
    signatureQuestion: "What interests does the dominant framing serve?",
    colorHex: "#DC2626",
  },
  {
    id: "ontological",
    name: "The Philosopher",
    epithet: "Excavates the unexamined assumptions inside every position.",
    signatureQuestion: "What does this debate assume exists — and does it cohere?",
    colorHex: "#57534E",
  },
  {
    id: "dissident",
    name: "The Outsider",
    epithet: "Seeks what affected communities and non-Western scholars see that institutions miss.",
    signatureQuestion: "Which credible voices are systematically excluded from this debate?",
    colorHex: "#047857",
  },
];
