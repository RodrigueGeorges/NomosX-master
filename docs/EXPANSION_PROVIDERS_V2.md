# 🚀 Plan d'expansion : Devenir #1 du secteur

**Objectif** : Passer de 26 à **60-80 sources exploitables** par requête

**Benchmark concurrence** :
- Consensus.app : ~20-30 sources
- Elicit.org : ~15-25 sources
- Perplexity : ~10-15 sources

**Notre cible** : **60-80 sources** = 3-4x la concurrence 🚀

---

## 📊 État actuel vs Cible

| Métrique | Actuel | Cible | Gain |
|----------|--------|-------|------|
| **Sources/requête** | 26 | 60-80 | **+230%** |
| **Providers actifs** | 4 | 10 | **+150%** |
| **Coverage global** | 400M works | 1B+ works | **+150%** |
| **Taux exploitation** | 40% | 60% | **+50%** |

---

## 🎯 PHASE 1 : Providers critiques (Semaine 1)

### 1. Semantic Scholar ⭐⭐⭐⭐⭐
**Priorité** : CRITIQUE

**Pourquoi** :
- 200M+ papers avec abstracts riches
- API gratuite, excellente qualité
- Taux abstrac : 80-90%
- Spécialiste IA/CS/Bio

**Impact attendu** : +15-20 sources/requête

**Implémentation** :
```typescript
// lib/providers/semanticscholar.ts
export async function searchSemanticScholar(query: string, limit = 50) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,year,citationCount,openAccessPdf,publicationTypes`;
  
  const response = await fetch(url, {
    headers: { "Accept": "application/json" }
  });
  
  const data = await response.json();
  const papers = data?.data || [];
  
  return papers
    .filter(p => p.abstract && p.abstract.length > 200) // Content-First
    .map(p => ({
      id: `s2:${p.paperId}`,
      provider: "semanticscholar",
      type: "paper",
      title: p.title,
      abstract: p.abstract,
      year: p.year,
      authors: p.authors?.map(a => ({ name: a.name })),
      citationCount: p.citationCount,
      pdfUrl: p.openAccessPdf?.url,
      oaStatus: p.openAccessPdf ? "oa" : null,
      contentLength: p.abstract.length,
      hasFullText: true
    }));
}
```

### 2. PubMed ⭐⭐⭐⭐⭐
**Priorité** : HAUTE (santé/bio)

**Pourquoi** :
- 35M+ articles biomédicaux
- Abstracts systématiques
- Gratuit, officiel NIH
- Taux abstract : 95%+

**Impact attendu** : +10-15 sources/requête (santé)

**Implémentation** :
```typescript
// lib/providers/pubmed.ts
export async function searchPubMed(query: string, limit = 50) {
  // 1. Search pour récupérer les PMIDs
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json`;
  
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  const pmids = searchData?.esearchresult?.idlist || [];
  
  if (pmids.length === 0) return [];
  
  // 2. Fetch pour récupérer les détails complets
  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
  
  const fetchRes = await fetch(fetchUrl);
  const xml = await fetchRes.text();
  
  // 3. Parser XML (utiliser xml2js ou DOMParser)
  const papers = parseXML(xml);
  
  return papers
    .filter(p => p.abstract && p.abstract.length > 200)
    .map(p => ({
      id: `pubmed:${p.pmid}`,
      provider: "pubmed",
      type: "paper",
      title: p.title,
      abstract: p.abstract,
      year: p.year,
      authors: p.authors,
      doi: p.doi,
      pdfUrl: p.pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${p.pmc}/pdf` : null,
      contentLength: p.abstract.length,
      hasFullText: true
    }));
}
```

### 3. CORE ⭐⭐⭐⭐
**Priorité** : HAUTE

**Pourquoi** :
- 300M+ open access papers
- API gratuite (clé requise)
- Excellente coverage UK/EU
- Taux abstract : 70%

**Impact attendu** : +8-12 sources/requête

**Implémentation** :
```typescript
// lib/providers/core.ts
export async function searchCORE(query: string, limit = 50) {
  const apiKey = process.env.CORE_API_KEY;
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=${limit}`;
  
  const response = await fetch(url, {
    headers: { 
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });
  
  const data = await response.json();
  const works = data?.results || [];
  
  return works
    .filter(w => w.abstract && w.abstract.length > 200)
    .map(w => ({
      id: `core:${w.id}`,
      provider: "core",
      type: "paper",
      title: w.title,
      abstract: w.abstract,
      year: w.yearPublished,
      authors: w.authors?.map(a => ({ name: a })),
      doi: w.doi,
      pdfUrl: w.downloadUrl,
      oaStatus: "oa",
      contentLength: w.abstract.length,
      hasFullText: true
    }));
}
```

---

## 🎯 PHASE 2 : Providers spécialisés (Semaine 2)

### 4. Europe PMC ⭐⭐⭐⭐
**Priorité** : HAUTE (santé EU)

**Pourquoi** :
- 40M+ publications santé
- Complément parfait de PubMed
- Abstracts + full text
- Gratuit, API excellente

**Impact attendu** : +5-8 sources/requête (santé)

### 5. SSRN ⭐⭐⭐
**Priorité** : MOYENNE (sciences sociales)

**Pourquoi** :
- 1M+ preprints économie/finance/droit
- Abstracts longs et détaillés
- Spécialiste business/policy
- Taux abstract : 100%

**Impact attendu** : +5-10 sources/requête (policy/éco)

### 6. RePEc ⭐⭐⭐
**Priorité** : MOYENNE (économie)

**Pourquoi** :
- 4M+ publications économie
- API gratuite
- Spécialiste recherche économique
- Complémentaire SSRN

**Impact attendu** : +3-5 sources/requête (éco)

---

## 🎯 PHASE 3 : Providers régionaux (Semaine 3)

### 7. J-STAGE ⭐⭐⭐
**Priorité** : MOYENNE (Japon)

**Pourquoi** :
- 3M+ articles japonais
- Abstracts anglais disponibles
- Coverage Asie unique
- Gratuit

**Impact attendu** : +2-4 sources/requête

### 8. SciELO ⭐⭐⭐
**Priorité** : MOYENNE (Amérique Latine)

**Pourquoi** :
- 1M+ articles open access
- Coverage Amérique Latine
- Abstracts multilingues
- Gratuit

**Impact attendu** : +2-4 sources/requête

### 9. DOAJ ⭐⭐⭐
**Priorité** : BASSE (index OA)

**Pourquoi** :
- 8M+ articles open access
- Aggregateur de qualité
- Taux abstract : 80%

**Impact attendu** : +3-5 sources/requête

---

## 🔧 OPTIMISATIONS Providers existants

### Fix HAL (actuellement 0% !) 🚨

**Problème** : Parser n'extrait pas les abstracts

**Solution** :
```typescript
// lib/providers/hal.ts
export async function searchHAL(query: string, rows = 50) {
  const url = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=${rows}&fl=docid,title_s,abstract_s,authFullName_s,producedDate_tdate,doiId_s,uri_s,fileMain_s`;
  
  const data = await fetchFromProvider("hal", url);
  const docs = data?.response?.docs || [];
  
  return docs
    .filter(doc => {
      // Fix: vérifier que abstract_s existe ET n'est pas vide
      const abstract = Array.isArray(doc.abstract_s) 
        ? doc.abstract_s[0] 
        : doc.abstract_s;
      return abstract && abstract.length > 200;
    })
    .map(doc => ({
      id: `hal:${doc.docid}`,
      provider: "hal",
      title: Array.isArray(doc.title_s) ? doc.title_s[0] : doc.title_s,
      abstract: Array.isArray(doc.abstract_s) ? doc.abstract_s[0] : doc.abstract_s,
      // ... reste
      contentLength: Array.isArray(doc.abstract_s) 
        ? doc.abstract_s[0].length 
        : doc.abstract_s.length,
      hasFullText: true
    }));
}
```

**Impact attendu** : +8-12 sources/requête

### Augmenter volumes par provider

**Actuel** : 25 résultats/provider  
**Nouveau** : 50 résultats/provider

```typescript
// lib/agent/pipeline-v2.ts
export async function scout(query: string, providers: Providers, perProvider = 50) { // était 20
  // ...
}
```

**Impact attendu** : +40% volume global

---

## 📊 Projection : Nouveau volume

| Provider | Actuel | Après optimisation | Contribution |
|----------|--------|-------------------|--------------|
| **OpenAlex** | 13 | 20 (+54%) | 25% |
| **Semantic Scholar** | - | 18 (NEW) | 23% |
| **theses.fr** | 8 | 12 (+50%) | 15% |
| **PubMed** | - | 12 (NEW) | 15% |
| **HAL** | 0 | 10 (FIX) | 13% |
| **CORE** | - | 8 (NEW) | 10% |
| **Crossref** | 5 | 8 (+60%) | 10% |
| **SSRN** | - | 5 (NEW) | 6% |
| **Europe PMC** | - | 5 (NEW) | 6% |
| **RePEc** | - | 3 (NEW) | 4% |
| **TOTAL** | **26** | **78** | **+300%** 🚀 |

---

## 🎯 Stratégie de déploiement

### Semaine 1 : Quick wins
- ✅ Fix HAL parser (+10 sources)
- ✅ Augmenter perProvider à 50 (+8 sources)
- ✅ Ajouter Semantic Scholar (+18 sources)
- **→ Passer de 26 à 52 sources (+100%)**

### Semaine 2 : Expansion santé
- ✅ Ajouter PubMed (+12 sources)
- ✅ Ajouter CORE (+8 sources)
- ✅ Ajouter Europe PMC (+5 sources)
- **→ Passer de 52 à 77 sources (+196%)**

### Semaine 3 : Spécialisation
- ✅ Ajouter SSRN (policy/éco)
- ✅ Ajouter RePEc (éco)
- ✅ Optimiser scoring multi-providers
- **→ Atteindre 80+ sources (+308%)**

---

## 💰 Avantages concurrentiels

### vs Consensus.app
```
Consensus : ~25 sources
NomosX    : 78 sources (+312%)

Différence :
+ 3x plus de sources
+ Coverage francophone (theses.fr)
+ Santé exhaustive (PubMed + Europe PMC)
+ Policy/éco (SSRN + RePEc)
```

### vs Elicit.org
```
Elicit  : ~20 sources
NomosX  : 78 sources (+390%)

Différence :
+ 4x plus de sources
+ Multi-providers (10 vs 3)
+ Content-First (qualité garantie)
+ Agents spécialisés (READER/ANALYST/COUNCIL)
```

### vs Perplexity
```
Perplexity : ~12 sources web
NomosX     : 78 sources académiques (+650%)

Différence :
+ 6x plus de sources
+ Sources académiques peer-reviewed
+ Citations traçables
+ Analyse profonde (claims/methods/results)
```

---

## 🚀 Fonctionnalités premium

### 1. Multi-modal search
```typescript
// Recherche simultanée sur 10 providers
const results = await scout(query, [
  "openalex", "semanticscholar", "pubmed", 
  "hal", "thesesfr", "core", 
  "crossref", "europepmc", "ssrn", "repec"
], 50);

// → 60-80 sources en 3-5 secondes
```

### 2. Domain-specific routing
```typescript
// Routing intelligent par domaine
if (domain === "health") {
  providers = ["pubmed", "europepmc", "openalex", "semanticscholar"];
} else if (domain === "economics") {
  providers = ["ssrn", "repec", "openalex", "thesesfr"];
} else if (domain === "france") {
  providers = ["thesesfr", "hal", "openalex"];
}
```

### 3. Real-time quality scoring
```typescript
// Score en temps réel avec multi-critères
qualityScore = 
  contentBonus (0-20) +      // Abstract rich
  recencyScore (0-30) +      // Publications récentes
  citationScore (0-25) +     // Impact
  providerBonus (0-15) +     // Provider premium
  domainMatch (0-10);        // Pertinence domaine

// Sélection top 15 sources avec score > 70
```

---

## 📈 Métriques de succès

### KPIs Phase 1 (Semaine 1)
- ✅ 50+ sources/requête
- ✅ 5 providers actifs
- ✅ HAL opérationnel (10+ sources)

### KPIs Phase 2 (Semaine 2)
- ✅ 70+ sources/requête
- ✅ 8 providers actifs
- ✅ Coverage santé exhaustive

### KPIs Phase 3 (Semaine 3)
- ✅ 80+ sources/requête
- ✅ 10 providers actifs
- ✅ 3-4x volume vs concurrence
- ✅ #1 du secteur 🏆

---

## 🎯 Roadmap technique

### Court terme (1-2 semaines)
```
1. Implémenter Semantic Scholar   [PRIORITÉ 1]
2. Fix HAL parser                 [PRIORITÉ 1]
3. Augmenter perProvider à 50     [PRIORITÉ 1]
4. Implémenter PubMed             [PRIORITÉ 2]
5. Implémenter CORE               [PRIORITÉ 2]
```

### Moyen terme (3-4 semaines)
```
6. Implémenter Europe PMC
7. Implémenter SSRN
8. Implémenter RePEc
9. Domain-specific routing
10. Real-time quality scoring
```

### Long terme (2-3 mois)
```
11. Cache distribué Redis
12. API rate limiting intelligent
13. Provider fallback strategy
14. A/B testing providers
15. ML pour provider selection
```

---

## 💡 Innovation différenciante

### 1. Hybrid Search
```
Academic papers (78 sources)
+ Web context (Perplexity-style)
+ Expert opinions (Twitter/LinkedIn)
= Most complete research briefs
```

### 2. Real-time monitoring
```
User queries → Track topics
New papers published → Auto-update briefs
Email digest → "New evidence found"
```

### 3. Collaborative research
```
Share briefs → Team collaboration
Annotate sources → Collective intelligence
Export formats → Markdown, PDF, Notion, Obsidian
```

---

## 🏆 Objectif final

**Devenir le Google Scholar + ChatGPT de la recherche académique**

- **Volume** : 60-80 sources/requête (3-4x concurrence)
- **Qualité** : Content-First, 100% exploitable
- **Vitesse** : 3-5 secondes pour brief complet
- **Intelligence** : Agents READER/ANALYST/COUNCIL
- **Différenciation** : Coverage francophone unique

**Résultat** : **#1 du secteur** 🚀

---

**Version** : 2.0  
**Status** : Ready to implement  
**Impact attendu** : +300% volume, devenir leader marché
