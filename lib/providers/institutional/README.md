# 🏛️ Providers Institutionnels - NomosX

**Think Tank IA avec sources renseignement, défense, économie, cyber**

---

## 📊 Vue d'Ensemble

**Total providers** : 41 sources institutionnelles

| Catégorie | Providers | Priorité | Use Cases |
|-----------|-----------|----------|-----------|
| 🔴 **Intelligence** | ODNI, CIA FOIA, NSA, UK JIC | CRITICAL | Threat assessments, géopolitique, sécurité nationale |
| 🟠 **Défense** | NATO, EEAS, SGDSN, EDA | HIGH | Stratégie militaire, alliances, doctrines |
| 🟡 **Économie** | IMF, World Bank, OECD, BIS | HIGH | Politique monétaire, développement, commerce |
| 🟢 **Cyber & Risques** | NIST, CISA, ENISA | MEDIUM | Cybersécurité, infrastructure critique, vulnérabilités |
| 🔵 **Multilatéral** | UN, UNDP, UNCTAD | MEDIUM | Gouvernance mondiale, développement durable, commerce |
| ⚪ **Archives** | NARA, UK Archives, Archives FR | LOW | Contexte historique, documents déclassifiés |
| 🟣 **Think Tanks (innovants)** | LawZero, GovAI, IAPS, CAIP, AIPI, CSET, AI Now, Data & Society, Abundance, CAIDP, SCSP, IFP, CDT, Brookings, FAI, CNAS, RAND, New America, Aspen Digital, R Street | MEDIUM | IA safety, gouvernance, policy innovation |

---

## 🚀 Quick Start

### Installation

```bash
npm install axios cheerio
```

### Usage Simple

```typescript
import { searchODNI, searchIMF, searchNATO } from '@/lib/providers/institutional';

// Recherche simple
const odniBriefs = await searchODNI("cyber threats", 10);
const imfReports = await searchIMF("inflation policy", 15);
const natoStrategies = await searchNATO("defense spending", 12);
```

### Usage avec Rate Limiting

```typescript
import { waitForRateLimit } from '@/lib/providers/institutional/rate-limiter';
import { searchCISA } from '@/lib/providers/institutional';

// Respecter les limites légales
await waitForRateLimit('cisa');
const results = await searchCISA("ransomware", 10);
```

---

## 📋 Providers Détaillés

### 🔴 INTELLIGENCE

#### ODNI (Office of Director of National Intelligence)
```typescript
searchODNI(query: string, limit = 10)
```
- **URL** : https://www.dni.gov
- **Contenu** : Threat assessments, Annual Threat Assessments, National Intelligence Strategy
- **Légalité** : Domaine public US (17 U.S.C. §105)
- **Rate Limit** : 1 req/s
- **Formats** : PDF, HTML

**Exemple** :
```typescript
const results = await searchODNI("artificial intelligence threats", 10);
// => Threat assessments sur IA, autonomie, cyber-enabled influence
```

#### CIA FOIA Reading Room
```typescript
searchCIAFOIA(query: string, limit = 10)
```
- **URL** : https://www.cia.gov/readingroom
- **Contenu** : Documents déclassifiés (Cold War, operations, analysis)
- **Légalité** : FOIA - Domaine public
- **Rate Limit** : 1 req/2s (serveur lent)
- **Particularité** : Documents historiques (1950s-2000s mostly)

**Exemple** :
```typescript
const docs = await searchCIAFOIA("economic espionage", 10);
// => Memos déclassifiés, assessments historiques
```

---

### 🟠 DÉFENSE

#### NATO
```typescript
searchNATO(query: string, limit = 15)
```
- **URL** : https://www.nato.int
- **Contenu** : Strategic Concepts, Communiqués, Defense expenditure, Cyber policy
- **Légalité** : Publications publiques libres
- **Rate Limit** : 1 req/s
- **Langues** : EN, FR (multilingue)

**Exemple** :
```typescript
const strategies = await searchNATO("cyber defense policy", 12);
// => Cyber Defence Pledge, Strategic Concepts, Brussels Summits
```

#### SGDSN (France)
```typescript
searchSGDSN(query: string, limit = 10)
```
- **URL** : https://www.sgdsn.gouv.fr
- **Contenu** : Revue stratégique, Doctrine, Risques majeurs
- **Légalité** : Licence Ouverte Etalab
- **Rate Limit** : 1 req/s
- **Langue** : FR

---

### 🟡 ÉCONOMIE

#### IMF (International Monetary Fund)
```typescript
searchIMF(query: string, limit = 15)
```
- **URL** : https://www.elibrary.imf.org
- **Contenu** : Working Papers, Country Reports, World Economic Outlook, GFSR
- **Légalité** : IMF Open Data Initiative
- **Rate Limit** : 1 req/s
- **Séries** : WP, CR, SDN, PPP

**Exemple** :
```typescript
const papers = await searchIMF("sovereign debt crisis", 15);
// => IMF Working Papers, Staff Discussion Notes sur dette souveraine
```

#### World Bank
```typescript
searchWorldBank(query: string, limit = 15)
```
- **URL** : https://openknowledge.worldbank.org
- **Contenu** : Policy Research, Country studies, Datasets
- **Légalité** : CC-BY 4.0
- **Rate Limit** : 1 req/s

---

### 🟢 CYBER & RISQUES

#### CISA (Cybersecurity & Infrastructure Security Agency)
```typescript
searchCISA(query: string, limit = 15)
```
- **URL** : https://www.cisa.gov
- **Contenu** : Cybersecurity advisories, Vulnerability assessments, ICS alerts
- **Légalité** : Domaine public US
- **Rate Limit** : 1 req/s
- **Temps réel** : Advisories publiées en temps réel

**Exemple** :
```typescript
const alerts = await searchCISA("critical infrastructure vulnerabilities", 15);
// => ICS-CERT advisories, Known Exploited Vulnerabilities
```

#### NIST
```typescript
searchNIST(query: string, limit = 15)
```
- **URL** : https://csrc.nist.gov
- **Contenu** : Special Publications (SP 800-series), FIPS, Cybersecurity Framework
- **Légalité** : Domaine public US
- **Référence** : Standards mondiaux cybersécurité

---

## 🎯 Use Cases par Domaine

### Géopolitique & Sécurité Nationale
```typescript
const providers = ['odni', 'cia-foia', 'uk-jic', 'nato', 'sgdsn'];
```
**Questions types** :
- "What are the main threats to European security in 2026?"
- "How do intelligence agencies assess China's military modernization?"
- "What is NATO's strategy on hybrid warfare?"

### Économie & Finance
```typescript
const providers = ['imf', 'worldbank', 'oecd', 'bis'];
```
**Questions types** :
- "What is IMF's outlook on global inflation?"
- "How does World Bank assess climate finance readiness?"
- "What are BIS views on central bank digital currencies?"

### Cybersécurité & Infrastructures
```typescript
const providers = ['nist', 'cisa', 'enisa'];
```
**Questions types** :
- "What are the most critical vulnerabilities in critical infrastructure?"
- "How does ENISA assess ransomware threats in EU?"
- "What are NIST recommendations for quantum-safe cryptography?"

### Gouvernance Mondiale
```typescript
const providers = ['un', 'undp', 'unctad'];
```
**Questions types** :
- "What is UN's position on AI governance?"
- "How does UNDP measure sustainable development progress?"

---

## ⚙️ Configuration Pipeline

### Intégration SCOUT Agent

```typescript
import { scout } from '@/lib/agent/pipeline-v2';

// Mix académique + institutionnel
const result = await scout(
  "cyber warfare doctrine",
  [
    // Académiques
    'openalex', 'semanticscholar',
    // Institutionnels
    'odni', 'nato', 'cisa', 'nist'
  ],
  20 // perProvider
);

// => Sources mixtes : papers + threat assessments + standards
```

### Providers Recommandés par Question

| Type Question | Providers Suggérés |
|---------------|-------------------|
| Menaces & risques | `odni`, `uk-jic`, `cisa`, `enisa` |
| Stratégie militaire | `nato`, `eeas`, `sgdsn`, `eda` |
| Économie/finance | `imf`, `worldbank`, `oecd`, `bis` |
| Cyber/tech | `nist`, `cisa`, `enisa` |
| Gouvernance | `un`, `undp`, `unctad` |
| Historique | `nara`, `cia-foia`, `uk-archives` |

---

## 📊 Scoring & Ranking

Les sources institutionnelles bénéficient de **bonus de crédibilité** :

```typescript
// lib/score.ts
const institutionalBonus = {
  intelligence: 30,   // ODNI, CIA, NSA
  defense: 25,        // NATO, SGDSN
  economic: 25,       // IMF, World Bank
  multilateral: 20,   // UN, OECD
  cyber: 22           // CISA, NIST, ENISA
};
```

**Résultat** : Sources institutionnelles = qualityScore élevé par défaut

---

## 🛡️ Conformité Légale

### ✅ Toutes sources = LEGAL
- US Government works : **Domaine public** (17 U.S.C. §105)
- UK : **Open Government Licence v3**
- France : **Licence Ouverte Etalab v2**
- EU : **Open Data Directive 2019/1024**
- Organisations internationales : **Open Access** (IMF, World Bank, UN)

### ⚠️ Obligations
1. **Rate limiting** : Max 1 req/s par provider (configuré automatiquement)
2. **User-Agent** : "NomosX Research Bot (+https://nomosx.com)"
3. **Robots.txt** : Respect absolu
4. **Attribution** : Toujours mentionner source

Voir [LEGAL.md](./LEGAL.md) pour détails complets.

---

## 🔧 Troubleshooting

### Provider retourne []
```typescript
// Causes possibles :
// 1. Query trop spécifique (essayer termes génériques)
// 2. Structure HTML changée (vérifier avec curl)
// 3. Rate limit hit (vérifier logs)
// 4. Site down temporairement

// Debug :
import { getRateLimitStats } from './rate-limiter';
console.log(getRateLimitStats());
```

### HTTP 429 (Too Many Requests)
```typescript
// Rate limiter gère automatiquement :
// - Attend délai indiqué (Retry-After header)
// - Retry une fois
// - Si échec : erreur propagée
```

### HTTP 403 (Forbidden)
```
// Causes :
// 1. Pas de User-Agent → FIXÉ (automatique)
// 2. IP bloquée → Contacter institution
// 3. Robots.txt violation → Vérifier code
```

---

## 📈 Roadmap

### Q1 2026 ✅
- [x] 21 providers implémentés
- [x] Rate limiting production
- [x] Documentation légale complète

### Q2 2026 🚧
- [ ] APIs officielles (IMF API, World Bank API)
- [ ] Cache Redis (éviter requêtes redondantes)
- [ ] Webhooks/RSS pour nouveaux docs
- [ ] PDF parsing (OCR pour documents scannés)

### Q3 2026 📅
- [ ] Monitoring dashboard (uptime, rate limits, errors)
- [ ] Auto-update si structure HTML change
- [ ] Expansion : +10 providers (DoD, Europol, etc.)

---

## 🤝 Contribution

Pour ajouter un nouveau provider :

1. Créer fichier dans catégorie appropriée :
   ```
   lib/providers/institutional/<category>/<provider>.ts
   ```

2. Implémenter fonction `search<Provider>()` :
   ```typescript
   export async function searchMyProvider(query: string, limit = 10) {
     // ...
     return sources; // Array<Source>
   }
   ```

3. Ajouter à `index.ts` :
   ```typescript
   export { searchMyProvider } from './category/my-provider';
   ```

4. Ajouter metadata :
   ```typescript
   'my-provider': { category: 'economic', priority: 7, rateLimit: 1000 }
   ```

5. Documenter légalité dans `LEGAL.md`

6. Tester :
   ```bash
   npm run test:provider my-provider
   ```

---

## 📞 Support

**Issues** : GitHub Issues  
**Email** : dev@nomosx.com  
**Docs** : https://docs.nomosx.com/providers

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2026-01-23  
**Maintainer** : NomosX Engineering Team
