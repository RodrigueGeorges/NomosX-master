/**
 * STYLE ORCHESTRATOR — NomosX
 *
 * Sélectionne et compose un guide d'écriture crédible par domaine / institution,
 * pour éviter le ton "IA" des LLMs et imiter des think tanks de référence.
 *
 * Inspirations :
 * - Harvard Kennedy School : policy memo, BLUF, active voice, skimmable
 * - France Stratégie : note d'analyse, discours-expert, méthodo visible, consensus
 * - Institut Montaigne : note d'action, analyse-débat-action, modèle français/européen
 * - McKinsey Global Institute : executive summary, In Brief, micro-to-macro, data
 * - RAND Corporation : rigueur, objectivité, peer review, limitations explicit
 * - Chatham House : realistic ambition, international, long-term, no over-prescription
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThinkTankStyle =
  | 'harvard'
  | 'france-strategie'
  | 'montaigne'
  | 'mckinsey'
  | 'rand'
  | 'chatham'
  | 'default';

export interface StyleProfile {
  style: ThinkTankStyle;
  name: string;
  audience: string;
  tone: string;
  rules: string[];
  forbidden: string[];
  structure: string[];
  starterPhrases: string[];
  closingPhrases: string[];
}

export interface StyleGuide {
  primary: StyleProfile;
  secondary?: StyleProfile;
  promptBlock: string;
  combinedVoice: string;
}

export interface StyleOrchestratorInput {
  question: string;
  domain?: string;
  audience?: 'policymaker' | 'executive' | 'expert' | 'public' | 'media';
  preferredStyle?: ThinkTankStyle;
  language?: 'en' | 'fr';
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export const PROFILES: Record<ThinkTankStyle, StyleProfile> = {
  default: {
    style: 'default',
    name: 'NomosX Editorial',
    audience: 'informed generalist',
    tone: 'clear, precise, evidence-led',
    rules: [
      'Lead with the bottom line (BLUF).',
      'Use short, active-voice sentences.',
      'Cite sources with [SRC-N] in-line.',
      'Distinguish fact from interpretation.',
      'Avoid filler adverbs (very, generally, moreover).',
    ],
    forbidden: [
      'Generic transitions ("It is important to note...", "In conclusion...").',
      'Staccato lists of one-line paragraphs.',
      'Over-hedged doublespeak.',
      'Marketing or sales language.',
    ],
    structure: ['Bottom line upfront', 'Evidence', 'Implications', 'Recommendations'],
    starterPhrases: ['The evidence points to...', 'Three factors matter most:', 'Our assessment is that...'],
    closingPhrases: ['The priority for decision-makers is...', 'The risks of inaction include...'],
  },

  harvard: {
    style: 'harvard',
    name: 'Harvard Kennedy School Policy Memo',
    audience: 'senior government decision-maker',
    tone: 'concise, assertive, decision-oriented',
    rules: [
      'Open with a one-paragraph executive summary: problem, recommendation, why.',
      'Use active voice and strong verbs.',
      'Make every paragraph skimmable (bold key clause).',
      'State trade-offs and fallback options explicitly.',
      'Keep the memo to roughly 1-2 pages of equivalent density.',
    ],
    forbidden: [
      'Academic hedges ("it could be argued that...").',
      'Filler words: actually, generally, practically, very, therefore, moreover.',
      'Unnecessary acronyms without first definition.',
      'Wall-of-text paragraphs longer than 4 lines.',
    ],
    structure: ['Summary / BLUF', 'Problem and context', 'Options and trade-offs', 'Recommendation', 'Next steps'],
    starterPhrases: ['We recommend...', 'The core question is...', 'Three options present themselves:'],
    closingPhrases: ['The next decision point is...', 'Absent action, the most likely outcome is...'],
  },

  'france-strategie': {
    style: 'france-strategie',
    name: 'France Stratégie — Note d\'analyse',
    audience: 'public-sector planner and political staff',
    tone: 'expert, measured, institutional, methodologically transparent',
    rules: [
      'Frame the issue as a public-policy question requiring evidence.',
      'Make methodology and data limitations visible.',
      'Present divergences of view before synthesising.',
      'Use numbers and named sources for every empirical claim.',
      'End with orientations or options, not a single prescriptive order.',
    ],
    forbidden: [
      'Overly journalistic or emotional language.',
      'Unsourced comparisons.',
      'Conclusory language that hides uncertainty.',
      'Partisan or campaign-style phrasing.',
    ],
    structure: ['Question posée', 'Constats', 'Éléments d\'analyse', 'Divergences', 'Orientations'],
    starterPhrases: ['Cette note vise à...', 'L\'analyse repose sur...', 'Trois enseignements émergent :'],
    closingPhrases: ['Ces éléments invitent à envisager...', 'Une concertation ultérieure permettra de...'],
  },

  montaigne: {
    style: 'montaigne',
    name: 'Institut Montaigne — Note d\'action',
    audience: 'French and European public and private leaders',
    tone: 'independent, reformist, european, action-oriented',
    rules: [
      'Lead with a strong diagnostic of what is broken and why.',
      'Anchor France in European and international comparisons.',
      'Propose concrete, sequenced reforms with named actors.',
      'Acknowledge political feasibility and social acceptability.',
      'Use a direct, non-academic but rigorous voice.',
    ],
    forbidden: [
      'Vague calls for "more Europe" without specifics.',
      'Pessimism without a path forward.',
      'Technocratic jargon with no translation.',
      'Ignoring implementation obstacles.',
    ],
    structure: ['Diagnostic', 'Enjeux', 'Propositions opérationnelles', 'Calendrier', 'Acteurs'],
    starterPhrases: ['Le constat est simple :', 'Trois leviers permettent de...', 'L\'enjeu est de...'],
    closingPhrases: ['La mise en œuvre repose sur...', 'Le risque d\'inaction est mesurable :'],
  },

  mckinsey: {
    style: 'mckinsey',
    name: 'McKinsey Global Institute',
    audience: 'business and public-sector leaders',
    tone: 'data-driven, executive, "micro-to-macro"',
    rules: [
      'Open with an "In Brief" (3-5 bullets) of the key finding.',
      'Lead every section with a number or quantified claim.',
      'Use a "so what" after every data point.',
      'Connect micro trends to macro/sector implications.',
      'Be crisp: one idea per sentence.',
    ],
    forbidden: [
      'Unsupported adjectives ("significant", "substantial" without numbers).',
      'Long theoretical introductions.',
      'Vague recommendations.',
      'Academic hedging that obscures the point.',
    ],
    structure: ['In Brief', 'The core finding', 'Implications by sector', 'Imperatives for leaders'],
    starterPhrases: ['The data show that...', 'Our analysis finds that...', 'The implication is clear:'],
    closingPhrases: ['Leaders should focus on three priorities:', 'The window for action is...'],
  },

  rand: {
    style: 'rand',
    name: 'RAND Corporation Research Report',
    audience: 'policy analyst and defense planner',
    tone: 'rigorous, objective, transparent, cautious',
    rules: [
      'State research questions, methods and limitations early.',
      'Distinguish findings from conclusions from recommendations.',
      'Use probabilities, not certainties.',
      'Cite all sources precisely.',
      'Include a "Limitations" and "Future research" note.',
    ],
    forbidden: [
      'Advocacy language or policy prescriptions without evidence.',
      'Overstating causality.',
      'Unexamined assumptions.',
      'Sweeping geopolitical metaphors.',
    ],
    structure: ['Research questions', 'Methods', 'Findings', 'Conclusions', 'Recommendations', 'Limitations'],
    starterPhrases: ['This report addresses...', 'We find that...', 'The evidence suggests...'],
    closingPhrases: ['Further research is needed on...', 'Caveats apply to...'],
  },

  chatham: {
    style: 'chatham',
    name: 'Chatham House',
    audience: 'international affairs practitioner',
    tone: 'independent, long-term, "realistic ambition"',
    rules: [
      'Present options and trade-offs rather than single prescriptions.',
      'Use historical context and international comparisons.',
      'Be explicit about uncertainty and scenario-dependence.',
      'Write for an informed non-specialist in international affairs.',
      'Avoid national or partisan cheerleading.',
    ],
    forbidden: [
      'Moralizing or slogans.',
      'Short-term tactical advice without strategic framing.',
      'Overstating the role of any single actor.',
      'Predictions presented as certainties.',
    ],
    structure: ['Summary', 'Context and drivers', 'Options and trade-offs', 'Long-term priorities', 'Implications'],
    starterPhrases: ['The strategic context is...', 'Three long-term priorities emerge:', 'Rather than prescribe, this paper sets out...'],
    closingPhrases: ['The realistic ambition is to...', 'The cost of delay is...'],
  },
};

// ─── Style selection ──────────────────────────────────────────────────────────

function styleFromDomain(domain?: string, question?: string): ThinkTankStyle {
  const d = (domain || question || '').toLowerCase();
  if (/france|french|europe|eu |réforme|publique/.test(d)) return 'france-strategie';
  if (/montaigne|français|modèle français|cohesion|état|action publique/.test(d)) return 'montaigne';
  if (/mckinsey|business|sector|industry|productivity|growth|market|strategy/.test(d)) return 'mckinsey';
  if (/rand|defense|military|security|intelligence|threat|risk/.test(d)) return 'rand';
  if (/chatham|international|diplomacy|geopolitic|foreign policy|global/.test(d)) return 'chatham';
  if (/harvard|policy memo|public policy|us government|administration/.test(d)) return 'harvard';
  return 'default';
}

function styleFromAudience(audience?: string, defaultStyle: ThinkTankStyle = 'default'): ThinkTankStyle {
  if (audience === 'executive') return 'mckinsey';
  if (audience === 'policymaker') return 'harvard';
  if (audience === 'expert') return 'rand';
  if (audience === 'public') return 'france-strategie';
  if (audience === 'media') return 'chatham';
  return defaultStyle;
}

function pickSecondary(style: ThinkTankStyle): ThinkTankStyle | undefined {
  const pairs: Record<ThinkTankStyle, ThinkTankStyle | undefined> = {
    'france-strategie': 'montaigne',
    'montaigne': 'france-strategie',
    'harvard': 'mckinsey',
    'mckinsey': 'harvard',
    'rand': 'chatham',
    'chatham': 'rand',
    'default': undefined,
  };
  return pairs[style];
}

// ─── Compose style guide prompt block ─────────────────────────────────────────

export function composeStyleGuide(input: StyleOrchestratorInput): StyleGuide {
  const primaryStyle = input.preferredStyle
    || styleFromAudience(input.audience, styleFromDomain(input.domain, input.question));
  const primary = PROFILES[primaryStyle];
  const secondary = pickSecondary(primaryStyle) ? PROFILES[pickSecondary(primaryStyle)!] : undefined;

  const profile = primary;
  const mergedRules = [...profile.rules];
  if (secondary) mergedRules.push(`Also absorb: ${secondary.name} tone — ${secondary.tone}.`);

  const forbidden = [...profile.forbidden];
  if (secondary) forbidden.push(...secondary.forbidden);

  const promptBlock = `You are writing in the institutional voice of the ${profile.name} for an audience of ${profile.audience}.

TONE: ${profile.tone}

STRUCTURE: ${profile.structure.join(' → ')}

WRITING RULES:
${mergedRules.map(r => `- ${r}`).join('\n')}

FORBIDDEN PATTERNS (avoid to prevent an "AI" tone):
${[...new Set(forbidden)].map(r => `- ${r}`).join('\n')}

OPENING PHRASES YOU MAY USE (do not overuse):
${profile.starterPhrases.map(p => `- ${p}`).join('\n')}

CLOSING PHRASES YOU MAY USE:
${profile.closingPhrases.map(p => `- ${p}`).join('\n')}

FINAL INSTRUCTION: Read the draft aloud in your head. If every sentence is the same length or every paragraph is a one-line list, rewrite. Vary rhythm, merge short sentences, prefer subordinate clauses over staccato bullets. Never write a conclusion that opens with "In conclusion".
`;

  return {
    primary,
    secondary,
    promptBlock,
    combinedVoice: `${primary.name}${secondary ? ` + notes of ${secondary.name}` : ''}`,
  };
}

// ─── Quick helpers ────────────────────────────────────────────────────────────

export function renderStyleBadge(guide: StyleGuide): string {
  return `<!-- nomosx-voice: ${guide.combinedVoice} -->`;
}
