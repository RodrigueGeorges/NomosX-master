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
  | 'caps'
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
    name: 'NomosX — From Chaos to Nomos',
    audience: 'decision-makers who need to be right and can prove it',
    tone: 'confident but not dogmatic, literary but not decorative, committed but provisional',
    rules: [
      'POSITIONS, NOT OPINIONS — state what NomosX believes and why. "We believe X" not "It could be argued that X".',
      'Lead with the position. A reader who stops after the first paragraph knows what we think and why.',
      'Use short, active-voice sentences mixed with longer subordinate clauses. Vary rhythm. Never two consecutive sentences of the same length.',
      'Cite sources with [SRC-N] in-line. Every claim traceable. No exceptions.',
      'Distinguish fact from interpretation — but commit to the interpretation.',
      'Acknowledge uncertainty without hiding behind it: "We believe X, with confidence Y" not "X is true".',
      'Write scenarios as narratives set in the future tense, not bullet-pointed possibilities.',
      'Combat novlangue: no "leverage", "synergy", "paradigm shift", "game-changer", "value proposition", "deep dive".',
      'Connect ideas across domains — the most consequential insights live at intersections.',
      'End with a sentence that could stand alone as the entire position.',
    ],
    forbidden: [
      'Generic transitions ("It is important to note...", "In conclusion...").',
      'Staccato lists of one-line paragraphs.',
      'Over-hedged doublespeak ("It could perhaps be argued that...").',
      'Marketing or sales language.',
      'Novlangue: "leverage" (as verb), "synergy", "paradigm shift", "game-changer", "value proposition", "deep dive", "double down", "move the needle".',
      'Academic hedges that hide the position.',
      'Passive voice that hides agency ("mistakes were made").',
    ],
    structure: ['The Position', 'The Question', 'The Evidence', 'Three Futures', 'The Decision'],
    starterPhrases: ['We believe...', 'The evidence points to...', 'Three factors matter most:', 'Our position is...', 'The question is not whether X, but how X...'],
    closingPhrases: ['We believe X, with confidence Y, because Z — and we will revise the moment the evidence turns.', 'The priority is clear:', 'The risks of inaction are not theoretical:'],
  },

  harvard: {
    style: 'harvard',
    name: 'Harvard Kennedy School Policy Memo',
    audience: 'senior government decision-maker',
    tone: 'concise, assertive, decision-oriented',
    rules: [
      'Open with a one-paragraph executive summary: problem, recommendation, why.',
      'BLUF: audience should know what\'s wrong and what to do about it in the first paragraph.',
      'Use active voice and strong verbs.',
      'Make every paragraph skimmable: main idea in first 1-2 sentences, rest supports it.',
      'State trade-offs and fallback options explicitly — "What if the preferred option fails?"',
      'Present options with criteria for evaluation (not just a single recommendation).',
      'Include explicit fallback positions: "If option A fails, the fallback is..."',
      'Structure: problem (1/2 of memo) → solution (1/2 of memo).',
      'Keep the memo to roughly 1-2 pages of equivalent density (~1000 words).',
      'Assume reader has zero context. Avoid jargon and acronyms unless defined.',
    ],
    forbidden: [
      'Academic hedges ("it could be argued that...").',
      'Filler words: actually, generally, practically, very, therefore, moreover.',
      'Unnecessary acronyms without first definition.',
      'Wall-of-text paragraphs longer than 4 lines.',
      'Burying the key idea in the middle of page 3.',
      'Background sections that put the audience to sleep.',
    ],
    structure: ['BLUF (Bottom Line Up Front)', 'Problem and context', 'Options and trade-offs', 'Recommendation', 'Fallback positions', 'Next steps'],
    starterPhrases: ['We recommend...', 'The core question is...', 'Three options present themselves:', 'The budget problem facing...'],
    closingPhrases: ['The next decision point is...', 'Absent action, the most likely outcome is...', 'If this approach fails, the fallback is...'],
  },

  'france-strategie': {
    style: 'france-strategie',
    name: 'France Stratégie — Note d\'analyse',
    audience: 'public-sector planner and political staff',
    tone: 'expert, measured, institutional, methodologically transparent, impersonal',
    rules: [
      'Frame the issue as a public-policy question requiring evidence.',
      'Make methodology and data limitations visible (use "encadrés" for methodology boxes).',
      'Present divergences of view before synthesising.',
      'Use numbers and named sources for every empirical claim.',
      'End with orientations or options, not a single prescriptive order.',
      'USE IMPERSONAL VOICE: "il convient de", "il apparaît que", "il ressort de", "cette note", "les résultats montrent que". Avoid "nous" except in prefaces.',
      'Open with data-driven context: "Depuis plus d\'une décennie...", "Un certain nombre d\'enquêtes..."',
      'Use cautious qualifiers: "semble indiquer", "pourrait", "il apparaît".',
      'Include a disclaimer: "Les opinions exprimées engagent leurs auteurs et n\'ont pas vocation à refléter la position du gouvernement."',
      'Label scenarios as "scénario tendanciel" or "scénario à horizon 2035/2040".',
    ],
    forbidden: [
      'Overly journalistic or emotional language.',
      'Unsourced comparisons.',
      'Conclusory language that hides uncertainty.',
      'Partisan or campaign-style phrasing.',
      'Direct imperative ("il faut") — use "il convient de" instead.',
      'First person "nous" in analytical sections (reserved for prefaces).',
    ],
    structure: ['Synthèse', 'Question posée', 'Constats', 'Éléments d\'analyse', 'Divergences', 'Orientations'],
    starterPhrases: ['Cette note vise à...', 'L\'analyse repose sur...', 'Il ressort de l\'inventaire :', 'Il convient de tirer parti de...'],
    closingPhrases: ['Ces éléments invitent à envisager...', 'Une concertation ultérieure permettra de...', 'Des fortes incertitudes demeurent néanmoins.'],
  },

  montaigne: {
    style: 'montaigne',
    name: 'Institut Montaigne — Note d\'action',
    audience: 'French and European public and private leaders',
    tone: 'independent, reformist, european, action-oriented, direct',
    rules: [
      'Lead with a strong diagnostic of what is broken and why.',
      'Anchor France in European and international comparisons.',
      'Propose concrete, sequenced reforms with named actors using "Objectif N → Proposition N" structure.',
      'Acknowledge political feasibility and social acceptability.',
      'Use a direct, non-academic but rigorous voice.',
      'USE "NOUS" inclusively: "nous ne nous résignons pas", "notre pays", "notre modèle".',
      'Use imperative language: "il faut", "il est impératif de", "il convient d\'accélérer".',
      'Include a "Synthèse" at the beginning and a "Liste des propositions" at the end.',
      'Recommendations must be "actionnables, chiffrées et mesurables" (actionable, quantified, measurable).',
      'Use national framing: "notre pays", "la France", "notre modèle".',
    ],
    forbidden: [
      'Vague calls for "more Europe" without specifics.',
      'Pessimism without a path forward.',
      'Technocratic jargon with no translation.',
      'Ignoring implementation obstacles.',
      'Cautious hedging — Montaigne is direct, not tentative.',
    ],
    structure: ['Synthèse', 'Diagnostic', 'Enjeux', 'Objectifs → Propositions opérationnelles', 'Calendrier', 'Acteurs', 'Liste des propositions'],
    starterPhrases: ['Le constat est simple :', 'Trois leviers permettent de...', 'L\'enjeu est de...', 'Il est impératif de...', 'Nous ne nous résignons pas à...'],
    closingPhrases: ['La mise en œuvre repose sur...', 'Le risque d\'inaction est mesurable :', 'À cette passivité résignée, nous préférons un optimisme de combat.'],
  },

  caps: {
    style: 'caps',
    name: 'CAPS — Carnets du Centre d\'Analyse, de Prévision et de Stratégie',
    audience: 'French Foreign Ministry decision-makers and diplomats',
    tone: 'prospective, independent, anticipatory, "penser sans contraintes"',
    rules: [
      'Structure around three verbs: ANALYSER (understand), AGIR (act), ANTICIPER (anticipate).',
      'Imagine "futurs possibles" rather than predictions.',
      'Think "without constraints and without preconceptions" (penser sans contraintes et sans idées reçues).',
      'Provide strategic recommendations to the Minister, not public advocacy.',
      'Use diplomatic, formal but forward-looking language.',
      'Include "Éclairage" and "Décryptage" sections for context.',
      'Distinguish between analysis, action, and anticipation clearly.',
    ],
    forbidden: [
      'Public advocacy or partisan positioning.',
      'Predictions presented as certainties.',
      'Overly academic tone — this is for practitioners.',
      'Ignoring diplomatic sensitivities.',
    ],
    structure: ['Préface', 'Analyser', 'Agir', 'Anticiper', 'Varia'],
    starterPhrases: ['L\'analyse conduit à...', 'Trois futurs possibles se dessinent...', 'La stratégie devrait viser...'],
    closingPhrases: ['Ces éléments suggèrent que...', 'La marge de manœuvre dépendra de...'],
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
  if (/diplomatie|diplomatique|affaires étrangères|quai d'orsay|caps|prévision stratégique/.test(d)) return 'caps';
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
    'caps': 'france-strategie',
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
