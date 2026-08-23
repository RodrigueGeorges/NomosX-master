/**
 * STYLE JUDGE — NomosX
 *
 * Agent intelligent qui selectionne, critique et affine le style editorial.
 * Pas un simple profil statique : il lit la question, les sources, le domaine,
 * l'audience et le draft, puis juge quelle voix think tank est la plus crédible.
 *
 * Inspirations :
 * - LLM-Rubric (Microsoft) : evaluation multi-dimension avec calibration
 * - Rulers (LabRAI) : rubriques verrouillees et evidence-anchored scoring
 * - humanizer-skill / etincel : detection et correction des "AI tells"
 * - stylometric-transfer : profils stylometriques explicites
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { composeStyleGuide, type ThinkTankStyle, type StyleGuide, PROFILES, type StyleOrchestratorInput } from './style-orchestrator';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StyleJudgment {
  primary: ThinkTankStyle;
  secondary: ThinkTankStyle | null;
  confidence: number;
  rationale: string;
  risk: 'low' | 'medium' | 'high';
  suggestedOpenings: string[];
  forbiddenTells: string[];
}

export interface StyleScore {
  style: ThinkTankStyle;
  relevance: number;    // 0-1
  feasibility: number;  // 0-1
  risk: number;         // 0-1
  total: number;        // 0-1
  reason: string;
}

export interface StyleCritique {
  overall: number; // 0-100
  aiTells: string[];
  weakPhrases: { original: string; suggestion: string }[];
  rhythmIssues: string[];
  structuralIssues: string[];
  voiceIssues: string[];
  actionItems: string[];
}

export interface IntelligentStyleInput {
  question: string;
  domain?: string;
  audience?: 'policymaker' | 'executive' | 'expert' | 'public' | 'media';
  preferredStyle?: ThinkTankStyle;
  language?: 'en' | 'fr';
  sources?: any[];
  draftHtml?: string;
}

// ─── Static heuristics (fast path) ───────────────────────────────────────────

function heuristicStyleScores(input: StyleOrchestratorInput, sources?: any[]): StyleScore[] {
  const q = (input.question || '').toLowerCase();
  const d = (input.domain || q).toLowerCase();

  const signals: Record<ThinkTankStyle, number> = {
    default: 0.4,
    harvard: 0.5,
    'france-strategie': 0.5,
    montaigne: 0.5,
    mckinsey: 0.5,
    rand: 0.5,
    chatham: 0.5,
  };

  // Domain keywords
  if (/france|français|europe|européen|réforme|politique publique/.test(d)) {
    signals['france-strategie'] += 0.25;
    signals.montaigne += 0.15;
  }
  if (/mckinsey|business|industry|productivity|growth|market|strategy|sector/.test(d)) {
    signals.mckinsey += 0.3;
  }
  if (/defense|military|security|intelligence|threat|risk|war|weapon|cyber/.test(d)) {
    signals.rand += 0.3;
  }
  if (/international|diplomacy|geopolitic|foreign policy|global|un|nato/.test(d)) {
    signals.chatham += 0.3;
  }
  if (/harvard|policy memo|administration|governance|us government/.test(d)) {
    signals.harvard += 0.25;
  }
  if (/diagnostic|propositions|opérationnel|réforme|modèle/.test(d)) {
    signals.montaigne += 0.25;
  }

  // Audience override
  if (input.audience === 'executive') signals.mckinsey += 0.25;
  if (input.audience === 'policymaker') signals.harvard += 0.25;
  if (input.audience === 'expert') signals.rand += 0.25;
  if (input.audience === 'public') signals['france-strategie'] += 0.25;
  if (input.audience === 'media') signals.chatham += 0.25;

  // Source provider signal
  if (sources) {
    const providerText = sources.map(s => `${s.provider} ${s.title ?? ''}`).join(' ').toLowerCase();
    if (/openalex|arxiv|nber/.test(providerText)) signals.harvard += 0.1;
    if (/eurostat|insee|oecd/.test(providerText)) signals['france-strategie'] += 0.1;
    if (/msci|bloomberg|economist|world bank/.test(providerText)) signals.mckinsey += 0.1;
  }

  // Normalise to ~0-1
  const max = Math.max(...Object.values(signals));
  const total = Object.values(signals).reduce((a, b) => a + b, 0);

  return (Object.keys(signals) as ThinkTankStyle[]).map((style) => {
    const relevance = signals[style] / max;
    const feasibility = style === input.preferredStyle ? 1.0 : 0.85;
    const risk = relevance > 0.8 ? 0.2 : relevance < 0.5 ? 0.4 : 0.3;
    return {
      style,
      relevance,
      feasibility,
      risk,
      total: (relevance * 0.5 + feasibility * 0.3 - risk * 0.2) / 0.6,
      reason: `relevance=${relevance.toFixed(2)} from domain/audience/source signals`,
    };
  });
}

// ─── LLM judgment (slow path, richer) ─────────────────────────────────────────

export async function judgeStyle(
  input: StyleOrchestratorInput,
  sources?: any[],
): Promise<StyleJudgment> {
  const heuristics = heuristicStyleScores(input, sources);
  const top3 = heuristics
    .filter((s) => s.style !== 'default')
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const profileText = top3
    .map((s) => `- ${s.style}: ${PROFILES[s.style].name} — audience: ${PROFILES[s.style].audience}`)
    .join('\n');

  const sourceText = (sources ?? [])
    .slice(0, 8)
    .map((s, i) => `[SRC-${i + 1}] ${(s.title ?? 'Source').slice(0, 120)} (${s.provider ?? 'unknown'})`)
    .join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a style strategist for a top-tier think tank. Given a research question, domain, audience and source list, choose the best writing style profile and a secondary accent. Return only valid JSON.',
      },
      {
        role: 'user',
        content: `QUESTION: ${input.question}\n\nDOMAIN: ${input.domain ?? 'unspecified'}\n\nAUDIENCE: ${input.audience ?? 'policymaker'}\n\nHEURISTIC CANDIDATES (top 3):\n${top3.map((s) => `- ${s.style}: total=${s.total.toFixed(2)}, ${s.reason}`).join('\n')}\n\nPROFILES:\n${profileText}\n\nSOURCES:\n${sourceText}\n\nTASK: Return JSON:\n{\n  "primary": "one of the styles",\n  "secondary": "one of the styles or null",\n  "confidence": 0-100,\n  "rationale": "one sentence explaining the judgment",\n  "risk": "low|medium|high",\n  "suggestedOpenings": ["phrase 1", "phrase 2"],\n  "forbiddenTells": ["list of AI tells to avoid for this audience"]\n}\n\nBe decisive. The primary must be the best fit, not the safest.`,
      },
    ],
    task: 'enrichment_reasoner',
    temperature: 0.25,
    maxTokens: 1200,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<StyleJudgment>(response.content);
  if (parsed) {
    return { ...parsed, confidence: Math.max(0, Math.min(100, parsed.confidence)) };
  }

  // Fallback
  const primary = (top3[0]?.style ?? 'harvard') as ThinkTankStyle;
  const secondary = top3[1]?.style ?? null;
  return {
    primary,
    secondary,
    confidence: 60,
    rationale: `Heuristic fallback: ${primary} ranked highest for domain/audience signals.`,
    risk: 'medium',
    suggestedOpenings: PROFILES[primary].starterPhrases,
    forbiddenTells: PROFILES[primary].forbidden,
  };
}

// ─── Draft critique ───────────────────────────────────────────────────────────

export async function critiqueDraft(
  html: string,
  style: ThinkTankStyle,
): Promise<StyleCritique> {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  const profile = PROFILES[style];

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a senior editor. Critique this draft against the ${profile.name} style. Return JSON only.`,
      },
      {
        role: 'user',
        content: `STYLE: ${profile.name}\nTONE: ${profile.tone}\nFORBIDDEN: ${profile.forbidden.join('; ')}\n\nDRAFT:\n${text}\n\nReturn JSON:\n{\n  "overall": 0-100,\n  "aiTells": ["flag 1"],\n  "weakPhrases": [{"original": "...", "suggestion": "..."}],\n  "rhythmIssues": ["..."],\n  "structuralIssues": ["..."],\n  "voiceIssues": ["..."],\n  "actionItems": ["..."]\n}\n\nBe specific. Suggest before/after rewrites.`,
      },
    ],
    task: 'critique',
    temperature: 0.3,
    maxTokens: 1500,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<StyleCritique>(response.content);
  if (parsed) {
    return {
      ...parsed,
      overall: Math.max(0, Math.min(100, parsed.overall)),
    };
  }

  return {
    overall: 50,
    aiTells: [],
    weakPhrases: [],
    rhythmIssues: [],
    structuralIssues: ['Parse failed — review manually'],
    voiceIssues: [],
    actionItems: ['Re-run critique when parsing is fixed'],
  };
}

// ─── Intelligent style guide composer ─────────────────────────────────────────

export async function composeIntelligentStyleGuide(
  input: IntelligentStyleInput,
): Promise<{ guide: StyleGuide; judgment: StyleJudgment; critique?: StyleCritique }> {
  const baseInput: StyleOrchestratorInput = {
    question: input.question,
    domain: input.domain,
    audience: input.audience,
    preferredStyle: input.preferredStyle,
    language: input.language,
  };

  const judgment = await judgeStyle(baseInput, input.sources);

  // Compose guide with the chosen primary (and secondary)
  const style = composeStyleGuide({
    ...baseInput,
    preferredStyle: judgment.primary,
  });

  let critique: StyleCritique | undefined;
  if (input.draftHtml) {
    critique = await critiqueDraft(input.draftHtml, judgment.primary);
  }

  // Enrich prompt block with judgment-specific openings and tells
  const forbidden = new Set([...style.primary.forbidden, ...judgment.forbiddenTells]);
  const enrichedPrompt = `${style.promptBlock}\n\nEDITORIAL JUDGMENT:\nPrimary voice: ${style.combinedVoice}\nRationale: ${judgment.rationale}\nConfidence: ${judgment.confidence}%\nRisk: ${judgment.risk}\n\nSUGGESTED OPENINGS (use at most one, vary):\n${judgment.suggestedOpenings.map((s) => `- ${s}`).join('\n')}\n\nFORBIDDEN TELLS FOR THIS DOCUMENT:\n${[...forbidden].map((f) => `- ${f}`).join('\n')}${critique ? `\n\nPRE-DIAGNOSIS OF CURRENT DRAFT:\nOverall fit: ${critique.overall}%\nAI tells: ${critique.aiTells.join('; ') || 'none flagged'}\nPriority fixes: ${critique.actionItems.slice(0, 3).join('; ')}` : ''}\n`;

  return {
    guide: {
      ...style,
      promptBlock: enrichedPrompt,
    },
    judgment,
    critique,
  };
}
