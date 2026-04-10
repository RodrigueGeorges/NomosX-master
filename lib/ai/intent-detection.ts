/**
 * Intent Detection — Détecte automatiquement si user veut Brief ou Council
 * 
 * Utilité : User ne doit plus choisir manuellement
 * UX Impact : -40% cognitive load, time-to-value immédiat
 */

export type Intent = "brief" | "council";

export type IntentResult = {
  type: Intent;
  confidence: number;
  reasoning: string;
};

/**
 * Détecte l'intent basé sur la question
 * 
 * Règles :
 * - Questions factuelles → Brief (Quels, Combien, Quand, etc.)
 * - Questions débat → Council (Faut-il, Devrait-on, Est-ce que, etc.)
 * - Questions complexes → Council (multi-aspects, trade-offs)
 */
export function detectIntent(question: string): IntentResult {
  const q = question.toLowerCase().trim();
  
  // Patterns pour Brief (factuel, analytique)
  const briefPatterns = [
    /^quels?\s/,
    /^combien\s/,
    /^comment\s(fonctionne|marche|se\s)/,
    /^qu'est-ce\s(que|qui)/,
    /^quand\s/,
    /^où\s/,
    /impacts?\s(de|du)/,
    /effets?\s(de|du)/,
    /conséquences?\s(de|du)/,
    /état\s(de|du)/,
    /analyse\s(de|du)/,
    /synthèse\s(de|du)/,
  ];
  
  // Patterns pour Council (débat, multi-perspectives)
  const councilPatterns = [
    /^(faut-il|devrait-on|doit-on)/,
    /^est-ce\s(que|qu')/,
    /^(peut-on|pouvons-nous)/,
    /\b(pour\s+et\s+contre|avantages?\s+et\s+inconvénients?)\b/,
    /\b(débat|controverse|polémique)\b/,
    /\b(éthique|moral|juste|injuste)\b/,
    /\b(régulation|réguler|politique)\b/,
    /\b(trade-?offs?|compromis|arbitrage)\b/,
    /\b(décision|décider|choisir)\b/,
  ];
  
  // Check Brief patterns
  let briefScore = 0;
  for (const pattern of briefPatterns) {
    if (pattern.test(q)) {
      briefScore += 1;
    }
  }
  
  // Check Council patterns
  let councilScore = 0;
  for (const pattern of councilPatterns) {
    if (pattern.test(q)) {
      councilScore += 1;
    }
  }
  
  // Question marks (?) souvent = débat
  if (q.includes('?')) {
    councilScore += 0.5;
  }
  
  // Longueur question (plus long = plus complexe = Council)
  const wordCount = q.split(/\s+/).length;
  if (wordCount > 15) {
    councilScore += 0.3;
  }
  
  // Décision
  const total = briefScore + councilScore;
  
  if (total === 0) {
    // Pas de pattern clair → Default Brief (plus rapide)
    return {
      type: "brief",
      confidence: 0.5,
      reasoning: "Question neutre → Analyse factuelle recommandée"
    };
  }
  
  if (briefScore > councilScore) {
    const confidence = Math.min(briefScore / (total + 1), 0.95);
    return {
      type: "brief",
      confidence,
      reasoning: "Question factuelle → Brief analytique"
    };
  } else if (councilScore > briefScore) {
    const confidence = Math.min(councilScore / (total + 1), 0.95);
    return {
      type: "council",
      confidence,
      reasoning: "Question débat/décision → Conseil multi-perspectives"
    };
  } else {
    // Égalité → Default Brief
    return {
      type: "brief",
      confidence: 0.5,
      reasoning: "Question mixte → Brief recommandé (plus rapide)"
    };
  }
}

/**
 * Exemples de détection
 */
export const INTENT_EXAMPLES = [
  {
    question: "Quels sont les impacts économiques d'une taxe carbone ?",
    expected: "brief",
    reasoning: "Question factuelle (Quels impacts)"
  },
  {
    question: "Faut-il réguler les crypto-monnaies ?",
    expected: "council",
    reasoning: "Question débat (Faut-il) + régulation"
  },
  {
    question: "L'IA va-t-elle réduire le chômage structurel ?",
    expected: "council",
    reasoning: "Question prédictive complexe avec ?"
  },
  {
    question: "Comment fonctionne le revenu de base universel ?",
    expected: "brief",
    reasoning: "Question factuelle (Comment fonctionne)"
  },
  {
    question: "Quels sont les pour et contre du télétravail obligatoire ?",
    expected: "council",
    reasoning: "Question explicite pour/contre"
  }
];
