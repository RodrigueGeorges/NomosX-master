# 🏛️ Guide d'Intégration - Providers Institutionnels

**Pour : Équipe NomosX**  
**Date : 2026-01-23**  
**Temps de lecture : 10 min**

---

## 📊 Vue d'Ensemble

NomosX intègre désormais **21 sources institutionnelles** en plus des 8 sources académiques existantes.

### Catégories

| Type | Providers | Impact |
|------|-----------|--------|
| 🔴 **Intelligence** | ODNI, CIA FOIA, NSA, UK JIC | Threat assessments en temps réel |
| 🟠 **Défense** | NATO, EEAS, SGDSN, EDA | Doctrine militaire officielle |
| 🟡 **Économie** | IMF, World Bank, OECD, BIS | Données économiques primaires |
| 🟢 **Cyber** | NIST, CISA, ENISA | Standards & alertes sécurité |
| 🔵 **Multilatéral** | UN, UNDP, UNCTAD | Gouvernance mondiale |
| ⚪ **Archives** | NARA, UK Archives, FR | Contexte historique |

---

## 🚀 Démarrage Rapide

### 1. Migration Base de Données

```bash
# Dans le terminal NomosX
cd c:\Users\madeleine.stephann\OneDrive\Bureau\NomosX

# Créer la migration
npx prisma migrate dev --name add_institutional_fields

# Vérifier
npx prisma studio
# → Aller dans Source, voir nouveaux champs : issuer, issuerType, documentType
```

**Nouveaux champs dans `Source`** :
- `documentType` : "report", "assessment", "declassified", "dataset"
- `issuer` : "ODNI", "CIA", "IMF"...
- `issuerType` : "intelligence", "defense", "economic"...
- `classification` : "unclassified", "declassified", "public"
- `publishedDate` : Date officielle publication

### 2. Premier Test

```bash
# Test rapide des providers
node scripts/test-institutional.mjs
```

**Résultat attendu** :
```
🧪 TEST PROVIDERS INSTITUTIONNELS
============================================================

🔴 [1/4] Testing ODNI...
✅ ODNI: Found 3 sources
   Sample: "Annual Threat Assessment of the U.S. Intelligence Communit..."

🟡 [2/4] Testing IMF...
✅ IMF: Found 3 sources
   Sample: "Inflation Targeting Under Uncertainty..."

... etc
```

### 3. Premier Brief Institutionnel

```typescript
import { runFullPipeline } from '@/lib/agent/pipeline-v2';

const { briefId } = await runFullPipeline(
  "What are the main cybersecurity threats to critical infrastructure?",
  [
    // Academic
    'openalex',
    // Institutional
    'cisa',      // Cyber alerts US
    'enisa',     // Cyber threats EU
    'nist',      // Standards
    'odni'       // Intelligence assessment
  ]
);

console.log(`Brief créé : ${briefId}`);
```

**Valeur ajoutée** :
- Sources académiques = théorie
- CISA/ENISA = menaces en temps réel
- NIST = standards techniques
- ODNI = contexte géopolitique

---

## 🎯 Use Cases par Persona

### 1. Analyste Géopolitique

**Question** : "What is NATO's assessment of Russian military capabilities?"

**Providers** :
```typescript
['nato', 'odni', 'uk-jic', 'eeas', 'openalex']
```

**Résultat attendu** :
- 2-3 NATO strategic documents (doctrine officielle)
- 1-2 ODNI threat assessments (US intelligence)
- 1 UK JIC report (UK perspective)
- 1-2 EEAS analyses (EU perspective)
- 2-3 academic papers (contexte théorique)

**Différence vs concurrence** : Consensus institutionnel multi-sources, pas juste recherche académique.

---

### 2. Risk Analyst (Entreprise)

**Question** : "What are the most critical cybersecurity vulnerabilities for energy infrastructure?"

**Providers** :
```typescript
['cisa', 'enisa', 'nist', 'semanticscholar']
```

**Résultat attendu** :
- CISA ICS-CERT advisories (alertes temps réel)
- ENISA threat landscape report (vue européenne)
- NIST Special Publications (standards)
- Papers académiques (méthodes détection)

**Différence vs concurrence** : Alertes officielles + standards + recherche = actionnable immédiatement.

---

### 3. Policy Maker

**Question** : "Should the EU implement a carbon border tax?"

**Providers** :
```typescript
['imf', 'worldbank', 'oecd', 'eeas', 'openalex']
```

**Résultat attendu** :
- IMF working papers (impact fiscal)
- World Bank country studies (impact développement)
- OECD policy briefs (comparaisons internationales)
- EEAS position papers (doctrine EU)
- Papers académiques (modèles économiques)

**Différence vs concurrence** : Données primaires institutionnelles + position officielle EU + recherche.

---

### 4. Journaliste d'Investigation

**Question** : "What did US intelligence know about Soviet nuclear program in the 1980s?"

**Providers** :
```typescript
['cia-foia', 'nara', 'uk-archives', 'openalex']
```

**Résultat attendu** :
- CIA FOIA Reading Room (memos déclassifiés)
- NARA archives (documents officiels)
- UK National Archives (perspective britannique)
- Papers historiques (contexte académique)

**Différence vs concurrence** : Accès documents déclassifiés officiels, pas juste synthèses.

---

## 🎨 Impact UI/UX

### Badges Provider Type

Dans l'interface briefs, afficher badges :

```tsx
// components/SourceBadge.tsx
function SourceBadge({ source }) {
  if (source.issuerType === 'intelligence') {
    return <Badge color="red">🔴 Intelligence</Badge>;
  }
  if (source.issuerType === 'economic') {
    return <Badge color="yellow">🟡 Economic</Badge>;
  }
  // ... etc
  return <Badge color="gray">📚 Academic</Badge>;
}
```

**Résultat visuel** :
```
Sources (12):
[🔴 Intelligence] ODNI - Annual Threat Assessment 2026
[🟠 Defense] NATO - Strategic Concept 2022
[🟡 Economic] IMF - World Economic Outlook Oct 2025
[📚 Academic] OpenAlex - "Impact of sanctions on..."
```

### Filtre Sources

```tsx
// Page /briefs/[id]
<FilterBar>
  <Checkbox>🔴 Intelligence</Checkbox>
  <Checkbox>🟠 Defense</Checkbox>
  <Checkbox>🟡 Economic</Checkbox>
  <Checkbox>📚 Academic</Checkbox>
</FilterBar>
```

**UX** : Utilisateur peut focus sur type de sources pertinent pour son besoin.

---

## 📊 Métriques à Suivre

### Dashboard Analytics

**Métriques providers** :
```sql
-- Usage par provider
SELECT provider, COUNT(*) as sources_count
FROM "Source"
WHERE createdAt >= NOW() - INTERVAL '30 days'
GROUP BY provider
ORDER BY sources_count DESC;

-- Quality score moyen par type
SELECT 
  CASE 
    WHEN issuerType IS NOT NULL THEN issuerType 
    ELSE 'academic' 
  END as source_type,
  AVG(qualityScore) as avg_quality,
  COUNT(*) as count
FROM "Source"
GROUP BY source_type;
```

**KPIs attendus** :
- Sources institutionnelles = **25-30%** du total (équilibre avec académique)
- Quality score institutionnel = **85-95** (vs 70-80 académique)
- Briefs avec ≥3 sources institutionnelles = **60%+**

### A/B Testing

**Hypothèse** : Briefs avec sources institutionnelles ont meilleur engagement.

**Métriques** :
- Time on page (attendu : +30%)
- Scroll depth (attendu : +20%)
- Share rate (attendu : +40%)
- Premium conversion (attendu : +50%)

---

## 🛡️ Conformité & Monitoring

### Alertes à Configurer

**1. Rate Limit Violations**
```typescript
// Alert si > 10 erreurs 429 en 1h
if (count_429_last_hour > 10) {
  alert('URGENT: Rate limit exceeded for provider X');
}
```

**2. Provider Downtime**
```typescript
// Alert si provider retourne 0 sources pendant 24h
if (sources_count_24h === 0 && expected > 0) {
  alert('WARNING: Provider X may be down');
}
```

**3. Parse Failures**
```typescript
// Alert si taux succès parsing < 50%
if (parse_success_rate < 0.5) {
  alert('ERROR: Provider X HTML structure changed');
}
```

### Logs Compliance

**Tous les appels providers doivent logger** :
```typescript
{
  timestamp: "2026-01-23T10:30:00Z",
  provider: "odni",
  query: "cyber threats",
  http_status: 200,
  sources_found: 8,
  rate_limit_wait: 1000, // ms
  user_agent: "NomosX Research Bot...",
  compliance_ok: true
}
```

**Stockage** : 90 jours minimum (audit légal si contestation).

---

## 🔧 Troubleshooting

### Provider retourne 0 sources

**Causes possibles** :
1. **Query trop spécifique** → Essayer termes génériques
2. **Structure HTML changée** → Tester manuellement avec curl
3. **Rate limit hit** → Vérifier logs, attendre
4. **Site temporairement down** → Retry dans 1h

**Debug** :
```bash
# Test manuel
curl -A "NomosX Research Bot" "https://www.dni.gov/search?q=cyber"

# Check rate limiter
node -e "import { getRateLimitStats } from './lib/providers/institutional/rate-limiter'; console.log(getRateLimitStats());"
```

### HTTP 403 Forbidden

**Causes** :
- Pas de User-Agent → **FIXÉ** (automatique)
- IP bloquée → Contacter institution
- Robots.txt violation → Vérifier code

### Qualité sources basse

**Si qualityScore < 60 pour sources institutionnelles** :
- Vérifier abstract présent (si vide → score bas)
- Vérifier issuerType correctement set
- Vérifier scoring bonus appliqué (`lib/score.ts`)

---

## 📚 Documentation Complète

**Fichiers de référence** :
- `lib/providers/institutional/README.md` — Documentation technique complète
- `lib/providers/institutional/LEGAL.md` — Conformité légale détaillée
- `INSTITUTIONAL_PROVIDERS.md` — Overview stratégique
- `AGENTS.md` — Architecture agents (mis à jour)

**APIs** :
- Chaque provider : `lib/providers/institutional/<category>/<provider>.ts`
- Rate limiting : `lib/providers/institutional/rate-limiter.ts`
- Scoring : `lib/score.ts` (lignes 40-60)
- Pipeline : `lib/agent/pipeline-v2.ts` (lignes 35-80)

---

## 🎓 Formation Recommandée

### Pour Développeurs (2h)
1. Lire `lib/providers/institutional/README.md` (30 min)
2. Tester 3 providers manuellement (30 min)
3. Créer un brief test avec mix sources (30 min)
4. Review scoring logic `lib/score.ts` (30 min)

### Pour Product/Business (1h)
1. Lire ce guide (20 min)
2. Lire section "Impact Métier" dans `INSTITUTIONAL_PROVIDERS.md` (20 min)
3. Tester création brief via UI avec nouveaux providers (20 min)

### Pour Legal/Compliance (1h)
1. Lire intégralité `lib/providers/institutional/LEGAL.md` (40 min)
2. Vérifier logs rate limiting (10 min)
3. Q&A avec tech lead (10 min)

---

## 🚀 Prochaines Étapes

### Semaine 1 (Deploy)
- [ ] Migration Prisma production
- [ ] Deploy providers sur staging
- [ ] Test 10 briefs variés
- [ ] Monitoring dashboards configurés

### Semaine 2 (UI)
- [ ] Badges sources institutionnelles
- [ ] Filtres par type source
- [ ] Page /about mise à jour (mentionner 29 sources)

### Semaine 3 (Marketing)
- [ ] Blog post : "NomosX now integrates 21 institutional sources"
- [ ] Update landing page
- [ ] Demos clients (focus différenciation)

### Q2 2026 (APIs officielles)
- [ ] IMF API (datasets économiques)
- [ ] World Bank API (indicators)
- [ ] CISA API (alerts temps réel)

---

## 📞 Support

**Questions techniques** : dev@nomosx.com  
**Questions produit** : product@nomosx.com  
**Conformité légale** : legal@nomosx.com

**Slack** : #institutional-providers

---

**Version** : 1.0  
**Dernière mise à jour** : 2026-01-23  
**Auteur** : NomosX Engineering

---

✅ **Vous êtes prêts à déployer !** L'intégration est complète et production-ready.
