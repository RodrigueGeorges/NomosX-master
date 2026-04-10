/**
 * Question Enhancer
 * 
 * Enrichit automatiquement les questions pour obtenir de meilleurs résultats.
 * Philosophy: Never reject, always enhance. L'IA s'adapte à l'utilisateur.
 */

export interface EnhancementResult {
  originalQuestion: string;
  enhancedQuestion: string;
  searchTerms: string[];
  wasEnhanced: boolean;
  wasTranslated: boolean;
  domain: string;
  tips?: string[];
}

// Mapping de termes vagues vers des termes de recherche académique
const TERM_EXPANSIONS: Record<string, string[]> = {
  // Économie
  "économie": ["economic policy", "macroeconomics", "economic growth", "GDP"],
  "economy": ["economic policy", "macroeconomics", "economic growth", "GDP"],
  "demain": ["future", "2025", "2030", "forecast", "projection", "trends"],
  "tomorrow": ["future", "2025", "2030", "forecast", "projection", "trends"],
  "futur": ["future", "2025", "2030", "forecast", "projection", "emerging"],
  "future": ["future trends", "forecast", "projection", "emerging"],
  "avenir": ["future", "prospects", "outlook", "forecast"],
  
  // Technologie
  "ia": ["artificial intelligence", "machine learning", "deep learning", "AI"],
  "ai": ["artificial intelligence", "machine learning", "deep learning"],
  "intelligence artificielle": ["artificial intelligence", "machine learning", "neural networks"],
  "technologie": ["technology", "innovation", "digital transformation"],
  "tech": ["technology", "innovation", "digital", "software"],
  
  // Environnement
  "climat": ["climate change", "global warming", "carbon emissions", "climate policy"],
  "climate": ["climate change", "global warming", "carbon emissions"],
  "environnement": ["environment", "sustainability", "ecology", "pollution"],
  "environment": ["environmental policy", "sustainability", "ecology"],
  "écologie": ["ecology", "biodiversity", "ecosystem", "conservation"],
  
  // Santé
  "santé": ["health", "healthcare", "public health", "medicine"],
  "health": ["healthcare", "public health", "medical", "wellness"],
  "médecine": ["medicine", "medical research", "clinical", "therapy"],
  
  // Politique
  "politique": ["policy", "governance", "government", "regulation"],
  "politics": ["political science", "governance", "policy analysis"],
  "gouvernement": ["government", "public policy", "administration"],
  
  // Finance
  "finance": ["financial markets", "investment", "banking", "monetary policy"],
  "argent": ["money", "currency", "monetary", "financial"],
  "crypto": ["cryptocurrency", "blockchain", "bitcoin", "digital currency"],
  "bourse": ["stock market", "equity", "trading", "investment"],
};

// Domaines détectés
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  economics: ["économie", "economy", "économique", "economic", "gdp", "pib", "inflation", "croissance", "growth", "marché", "market", "commerce", "trade", "fiscal", "budget"],
  technology: ["technologie", "technology", "ia", "ai", "numérique", "digital", "software", "algorithm", "data", "cyber", "blockchain", "crypto"],
  climate: ["climat", "climate", "environnement", "environment", "carbone", "carbon", "émission", "emission", "écologie", "ecology", "durable", "sustainable"],
  health: ["santé", "health", "médical", "medical", "maladie", "disease", "thérapie", "therapy", "patient", "clinical", "pharmaceutical"],
  politics: ["politique", "political", "gouvernement", "government", "démocratie", "democracy", "élection", "election", "loi", "law", "régulation"],
  finance: ["finance", "financial", "banque", "bank", "investissement", "investment", "bourse", "stock", "monétaire", "monetary"],
  social: ["social", "société", "society", "inégalité", "inequality", "emploi", "employment", "travail", "work", "éducation", "education"],
};

/**
 * Détecte le domaine principal de la question
 */
function detectDomain(question: string): string {
  const q = question.toLowerCase();
  let maxScore = 0;
  let bestDomain = "general";

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (q.includes(keyword)) score++;
    }
    if (score > maxScore) {
      maxScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

/**
 * Extrait et enrichit les termes de recherche
 */
function extractSearchTerms(question: string): string[] {
  const q = question.toLowerCase();
  const terms: Set<string> = new Set();

  // Ajouter les mots significatifs de la question
  const words = q.split(/\s+/).filter(w => w.length > 3);
  words.forEach(w => {
    // Nettoyer la ponctuation
    const clean = w.replace(/[?!.,;:'"]/g, "");
    if (clean.length > 3) {
      terms.add(clean);
      // Ajouter les expansions si disponibles
      if (TERM_EXPANSIONS[clean]) {
        TERM_EXPANSIONS[clean].forEach(t => terms.add(t));
      }
    }
  });

  return Array.from(terms).slice(0, 10);
}

/**
 * Détecte si une question est en français
 */
function isFrench(question: string): boolean {
  const frenchIndicators = [
    // Articles & contractions
    "l'", "d'", "qu'", "le ", "la ", "les ", "du ", "des ", "au ", "aux ",
    // Interrogatifs
    "quel", "quelle", "quels", "quelles", 
    "comment", "pourquoi", "est-ce que", 
    // Verbes courants
    "sont", "sommes", "être", "avoir", "peut", "doit", "fait", "font",
    // Mots courants
    "français", "économie", "société", "travail", "étude",
    "taxe", "impact", "carbone", "demain", "emploi",
    // Prépositions
    " en ", " dans ", " sur ", " avec ", " pour ", " par ",
    "à ", "où "
  ];
  
  const q = question.toLowerCase();
  let frenchScore = 0;
  
  for (const indicator of frenchIndicators) {
    if (q.includes(indicator)) frenchScore++;
  }
  
  // Seuil réduit : 1 indicateur suffit (+ sensible)
  return frenchScore >= 1;
}

/**
 * Traduit une question française vers l'anglais (mapping manuel optimisé)
 * IMPORTANT : Remplacer les phrases composées EN PREMIER
 */
function translateToEnglish(question: string): string {
  let translated = question;
  
  // ÉTAPE 1 : Phrases composées (expressions complètes)
  const phraseMappings: Record<string, string> = {
    // Questions complètes
    "quel est l'impact": "what is the impact",
    "quels sont les impacts": "what are the impacts",
    "quelle est": "what is",
    "quelles sont": "what are",
    "quel est": "what is",
    "quels sont": "what are",
    
    // IA & Travail (expressions complètes)
    "l'impact de l'ia sur le travail": "the impact of ai on work",
    "impact de l'ia sur le travail": "impact of ai on work",
    "de l'ia sur le travail": "of ai on work",
    "sur le travail": "on work",
    "le travail": "work",
    "l'emploi": "employment",
    "les emplois": "jobs",
    
    // Climat
    "taxe carbone": "carbon tax",
    "en europe": "in europe",
    
    // Temps
    "de demain": "of tomorrow",
    "économie de demain": "economy of tomorrow",
  };
  
  for (const [fr, en] of Object.entries(phraseMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  // ÉTAPE 2 : Mots individuels
  const wordMappings: Record<string, string> = {
    // Interrogatifs
    "l'impact": "the impact",
    "les impacts": "the impacts",
    "comment": "how",
    "pourquoi": "why",
    "est-ce que": "",
    
    // IA & Tech
    "intelligence artificielle": "artificial intelligence",
    "l'ia": "ai",
    "de l'ia": "of ai",
    " ia ": " ai ",
    
    // Économie
    "économie": "economy",
    "économique": "economic",
    " travail": " work",
    
    // Société
    "société": "society",
    "social": "social",
    "politique": "policy",
    "gouvernement": "government",
    
    // Environnement
    "climat": "climate",
    "environnement": "environment",
    "carbone": "carbon",
    "taxe": "tax",
    
    // Santé
    "santé": "health",
    "médical": "medical",
    "maladie": "disease",
    
    // Finance
    "financier": "financial",
    "banque": "bank",
    "bourse": "stock market",
    
    // Europe
    "europe": "europe",
    "européen": "european",
    "français": "french",
    "france": "france",
  };
  
  for (const [fr, en] of Object.entries(wordMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  // ÉTAPE 3 : Prépositions & articles (dernier pour ne pas casser les phrases)
  const connectorMappings: Record<string, string> = {
    " sur ": " on ",
    " dans ": " in ",
    " de ": " of ",
    " du ": " of the ",
    " des ": " of ",
    " en ": " in ",
    " à ": " to ",
    " pour ": " for ",
    " avec ": " with ",
    " sans ": " without ",
    " par ": " by ",
    " le ": " the ",
    " la ": " the ",
    " les ": " the ",
  };
  
  for (const [fr, en] of Object.entries(connectorMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  // Nettoyer les espaces multiples
  translated = translated.replace(/\s+/g, ' ').trim();
  
  return translated;
}

/**
 * Enrichit une question vague en une requête de recherche efficace
 */
function buildEnhancedQuery(question: string, domain: string): string {
  let q = question.toLowerCase().trim();
  
  // STEP 1: Traduire en anglais si français (CRITIQUE pour les providers académiques)
  const needsTranslation = isFrench(question);
  if (needsTranslation) {
    q = translateToEnglish(q);
  }
  
  // Si la question est déjà bien formée (contient un verbe interrogatif + contexte)
  if (q.length > 50 && (q.includes("?") || /\b(what|how|why|which)\b/.test(q))) {
    return q;
  }

  // Enrichissement basé sur le domaine et les termes
  const terms = extractSearchTerms(q);
  
  // Construire une requête enrichie
  let enhanced = q;

  // Ajouter un contexte temporel si absent
  if (!/(20\d{2}|future|recent)/.test(q)) {
    enhanced += " recent research 2023-2025";
  }

  // Ajouter des termes de recherche académique selon le domaine
  const domainBoosts: Record<string, string> = {
    economics: "economic impact analysis policy",
    technology: "technological innovation implications",
    climate: "climate change environmental impact",
    health: "health outcomes medical research",
    politics: "policy analysis governance",
    finance: "financial markets economic effects",
    social: "social impact societal effects",
    general: "research analysis trends",
  };

  if (domainBoosts[domain] && !q.includes("research")) {
    enhanced += " " + domainBoosts[domain];
  }

  return enhanced;
}

/**
 * Génère des conseils optionnels pour l'utilisateur
 */
function generateTips(question: string, domain: string): string[] | undefined {
  const tips: string[] = [];
  const q = question.toLowerCase();

  if (q.length < 20) {
    tips.push("Questions plus détaillées = résultats plus précis");
  }

  if (!/(20\d{2}|depuis|since|récent|recent|d'ici|by)/.test(q)) {
    tips.push("Préciser une période (ex: 'depuis 2020') affine les résultats");
  }

  if (!/(impact|effet|effect|conséquence|consequence|cause|résultat|result)/.test(q)) {
    tips.push("Formuler en termes d'impact/effet donne des analyses plus riches");
  }

  return tips.length > 0 ? tips : undefined;
}

/**
 * Fonction principale : enrichit automatiquement une question
 * Ne rejette JAMAIS - améliore toujours
 * Traduit automatiquement FR → EN pour les providers académiques
 */
export function enhanceQuestion(question: string): EnhancementResult {
  const trimmed = question.trim();
  const domain = detectDomain(trimmed);
  const wasTranslated = isFrench(trimmed);
  const searchTerms = extractSearchTerms(trimmed);
  const enhancedQuestion = buildEnhancedQuery(trimmed, domain);
  const wasEnhanced = enhancedQuestion !== trimmed;
  const tips = generateTips(trimmed, domain);

  return {
    originalQuestion: trimmed,
    enhancedQuestion,
    searchTerms,
    wasEnhanced,
    wasTranslated,
    domain,
    tips,
  };
}

/**
 * Exemples pour l'UI
 */
export const EXAMPLE_QUESTIONS = [
  "Quels sont les impacts économiques d'une taxe carbone en Europe ?",
  "Comment l'IA affecte-t-elle l'emploi dans le secteur financier ?",
  "L'économie de demain", // Sera enrichi automatiquement
  "Crypto régulation",    // Sera enrichi automatiquement
];

export default enhanceQuestion;
