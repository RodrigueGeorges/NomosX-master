# 🕷️ Scraping Intelligent - Providers Institutionnels

## ⚠️ LIMITES DU SCRAPING HTML

**Problèmes** :
- Structure HTML change fréquemment
- Risque de ban IP si trop agressif
- Difficile à maintenir
- Pas de garantie de stabilité

## ✅ SOLUTIONS PRAGMATIQUES

### 1. PRIORISER APIs et RSS (70% des cas)

**Providers avec APIs** :
- IMF → https://data.imf.org/api
- World Bank → API REST complète
- OECD → API SDMX
- UN → UN Data API

**Providers avec RSS** :
- ODNI, NATO, CISA, ENISA, NIST, BIS
- **Plus stable que scraping HTML**
- Mis à jour automatiquement

### 2. Scraping LÉGER pour le reste (30%)

**Seulement si** :
- Pas d'API disponible
- Pas de RSS/Atom feed
- Contenu critique pour NomosX

**Outils recommandés** :
```bash
npm install puppeteer playwright    # Rendu JS si nécessaire
npm install cheerio                 # Parsing HTML léger
npm install node-html-parser        # Alternative Cheerio
```

### 3. Scraping "Respectueux"

**Règles strictes** :
- ✅ 1 requête / seconde MAX
- ✅ User-Agent clair : "NomosX Research Bot"
- ✅ Respecter robots.txt ABSOLUMENT
- ✅ Cache 24h minimum (éviter requêtes redondantes)
- ✅ Retry avec backoff exponentiel

**Exemple implémentation** :

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { setTimeout as sleep } from 'timers/promises';

const CACHE = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function scrapePage(url: string, selector: string) {
  // 1. Check cache
  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[SCRAPE] Cache hit: ${url}`);
    return cached.data;
  }
  
  // 2. Rate limit (1 req/s)
  await sleep(1000);
  
  // 3. Fetch with retries
  let attempts = 0;
  while (attempts < 3) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'NomosX Research Bot (+https://nomosx.com)'
        },
        timeout: 15000
      });
      
      // 4. Parse
      const $ = cheerio.load(data);
      const results = $(selector).map((i, el) => $(el).text()).get();
      
      // 5. Cache
      CACHE.set(url, { data: results, timestamp: Date.now() });
      
      return results;
      
    } catch (error: any) {
      attempts++;
      if (error.response?.status === 429) {
        // Rate limited → wait longer
        await sleep(attempts * 5000);
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Scraping failed after 3 attempts: ${url}`);
}
```

## 🎯 STRATÉGIE RECOMMANDÉE PAR PROVIDER

| Provider | Méthode | Fiabilité | Notes |
|----------|---------|-----------|-------|
| **IMF** | ✅ API + RSS | 95% | API officielle très stable |
| **World Bank** | ✅ API | 95% | API complète et documentée |
| **OECD** | ✅ API | 90% | API SDMX (complexe) |
| **ODNI** | ⚠️ RSS + Scraping léger | 70% | RSS pour news, scrape pour archives |
| **CIA FOIA** | ⚠️ Scraping + pagination | 60% | Structure change peu, mais lent |
| **NATO** | ✅ RSS | 80% | RSS stable |
| **CISA** | ✅ RSS + API | 90% | RSS pour alerts, scrape pour details |
| **ENISA** | ✅ RSS | 80% | Publications en RSS |
| **NIST** | ✅ RSS | 85% | Standards en RSS |
| **UN** | ✅ API + RSS | 85% | Plusieurs endpoints |
| **SGDSN** | ⚠️ Scraping | 50% | Site FR, structure changeante |

## 🚨 ALERTES ET MONITORING

**Système d'alerte si provider down** :

```typescript
// Créer alerte si 0 résultats pendant 24h
if (sources.length === 0 && lastSuccessful > 24h) {
  alert('Provider ${name} may be down or structure changed');
}
```

## 📊 ALTERNATIVE : PARTENARIATS

**Solution long terme** :
- Contacter institutions directement
- Demander accès bulk data
- Proposer partenariat NomosX

**Exemple email** :
```
Objet: Research Partnership - NomosX Think Tank

Dear [Institution],

NomosX is an AI-powered think tank analyzing global policy challenges.
We currently index your public publications to provide comprehensive
analysis to policymakers.

Would you be open to:
1. Providing structured data access (API/bulk download)
2. Being featured as an official data partner
3. Receiving feedback on how your research is used

This would improve data quality and give you visibility.

Best regards,
NomosX Team
```

## 🎯 RECOMMANDATION FINALE

**Phase 1 (Maintenant)** :
- ✅ Implémenter APIs (IMF, World Bank, OECD)
- ✅ Implémenter RSS feeds (80% coverage)
- ⚠️ Scraping minimal (seulement si critique)

**Phase 2 (Q2 2026)** :
- Monitorer taux succès par provider
- Améliorer scrapers pour providers à 100%
- Contacter institutions pour partenariats

**Phase 3 (Q3 2026)** :
- Webhooks temps réel (CISA alerts)
- Bulk data partnerships
- Auto-healing si structure HTML change
