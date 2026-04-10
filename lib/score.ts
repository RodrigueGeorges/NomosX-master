
export function scoreSource(input: {
  year?: number | null;
  citationCount?: number | null;
  oaStatus?: string | null;
  institutions?: string[] | null;
  provider?: string | null;
  type?: string | null;
  abstract?: string | null;
  hasFullText?: boolean | null;
  contentLength?: number | null;
  // NOUVEAUX CHAMPS pour sources institutionnelles
  issuerType?: string | null;
  classification?: string | null;
  documentType?: string | null;
}): number {
  const now = new Date().getFullYear();
  const year = input.year ?? now;
  const age = Math.max(0, now - year);
  const citations = input.citationCount ?? 0;
  const oa = (input.oaStatus ?? "").toLowerCase();
  const isOA = oa.includes("open") || oa.includes("oa") || oa.includes("gold") || oa.includes("green") || oa.includes("public");
  const recency = Math.max(0, 42 - age * 6);
  const citeScore = Math.min(34, Math.log10(citations + 1) * 16);
  const oaScore = isOA ? 14 : 0;
  const instScore = (input.institutions?.length ?? 0) > 0 ? 6 : 0;
  const typeBonus = input.type === "thesis" ? 4 : 0;
  const providerBonus = input.provider === "thesesfr" ? 3 : 0;
  
  // News sources: intrinsic value as real-time intelligence even without citations/full text
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];
  const newsBonus = newsProviders.includes(input.provider || '') ? 10 : 0;
  
  // 🆕 CONTENT QUALITY BONUS - La vraie valeur de l'app !
  // Sources avec contenu exploitable pour READER/ANALYST
  let contentBonus = 0;
  const contentLen = input.contentLength || input.abstract?.length || 0;
  
  if (input.hasFullText) {
    contentBonus = 20; // PDF complet disponible = énorme bonus
  } else if (contentLen >= 2000) {
    contentBonus = 18; // Abstract très substantiel
  } else if (contentLen >= 1000) {
    contentBonus = 12; // Abstract correct
  } else if (contentLen >= 500) {
    contentBonus = 6; // Abstract minimal
  }
  // Sinon 0 = métadonnées seules = pas de valeur analytique
  
  // 🆕 INSTITUTIONAL AUTHORITY BONUS
  // Sources institutionnelles = crédibilité intrinsèque
  let institutionalBonus = 0;
  if (input.issuerType) {
    switch (input.issuerType) {
      case 'intelligence':
        institutionalBonus = 30; // ODNI, CIA, NSA - autorité maximale
        break;
      case 'defense':
        institutionalBonus = 25; // NATO, SGDSN, DoD
        break;
      case 'economic':
        institutionalBonus = 25; // IMF, World Bank, BIS - données primaires
        break;
      case 'multilateral':
        institutionalBonus = 20; // UN, OECD
        break;
      case 'cyber':
        institutionalBonus = 22; // CISA, ENISA, NIST
        break;
    }
    
    // Bonus documents déclassifiés (valeur historique unique)
    if (input.classification === 'declassified') {
      institutionalBonus += 15;
    }
    
    // Bonus par type de document
    if (input.documentType === 'assessment') institutionalBonus += 10; // Threat assessments
    if (input.documentType === 'dataset') institutionalBonus += 8;     // Données économiques brutes
    if (input.documentType === 'directive') institutionalBonus += 6;   // Directives officielles
  }
  
  return Math.round(Math.min(100, recency + citeScore + oaScore + instScore + typeBonus + providerBonus + newsBonus + contentBonus + institutionalBonus));
}

/**
 * Novelty scoring: prioritize recent, under-cited, and emerging research
 */
export function scoreNovelty(input: {
  year?: number | null;
  citationCount?: number | null;
  createdAt?: Date | null;
}): number {
  const now = new Date().getFullYear();
  const year = input.year ?? now;
  const age = Math.max(0, now - year);
  const citations = input.citationCount ?? 0;
  
  // Recent papers score higher
  const recencyScore = Math.max(0, 50 - age * 10);
  
  // Under-cited papers are "novel" (not yet mainstream)
  const novelCiteScore = citations < 5 ? 30 : Math.max(0, 30 - Math.log10(citations) * 10);
  
  // Recently added to our DB
  const ingestRecency = input.createdAt 
    ? Math.max(0, 20 - (Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  return Math.round(Math.min(100, recencyScore + novelCiteScore + ingestRecency));
}
