# 📜 Conformité Légale - Sources Institutionnelles

**Date**: 2026-01-23  
**Version**: 1.0  
**Status**: Production-Ready

---

## ✅ SOURCES AUTORISÉES

### 🇺🇸 États-Unis - Domaine Public Fédéral

**Base légale** : [17 U.S.C. §105](https://www.law.cornell.edu/uscode/text/17/105)
> "Copyright protection under this title is not available for any work of the United States Government"

**Providers concernés** :
- ✅ ODNI (Office of Director of National Intelligence)
- ✅ CIA FOIA Reading Room
- ✅ NSA (National Security Agency)
- ✅ NARA (National Archives)
- ✅ NIST (National Institute of Standards and Technology)
- ✅ CISA (Cybersecurity & Infrastructure Security Agency)

**Conditions** :
- ✅ Crawling autorisé (domaine public)
- ✅ Réutilisation commerciale autorisée
- ⚠️ **Rate limiting obligatoire** : 1 requête/seconde maximum
- ⚠️ **User-Agent requis** : Identifier clairement "NomosX Research Bot"
- ✅ Respecter `robots.txt`

**Références** :
- [USA.gov Copyright Policy](https://www.usa.gov/government-works)
- [NARA Copyright](https://www.archives.gov/legal/copyright.html)

---

### 🇬🇧 Royaume-Uni - Open Government Licence

**Base légale** : [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

**Providers concernés** :
- ✅ UK Government (gov.uk)
- ✅ UK Joint Intelligence Committee
- ✅ UK National Archives

**Conditions** :
- ✅ Crawling autorisé
- ✅ Réutilisation commerciale autorisée
- ⚠️ Attribution obligatoire : "Source: UK Government, Open Government Licence v3.0"
- ⚠️ Rate limiting : 1 req/s recommandé
- ✅ Respecter `robots.txt`

---

### 🇫🇷 France - Licence Ouverte Etalab

**Base légale** : [Licence Ouverte v2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)

**Providers concernés** :
- ✅ SGDSN (Secrétariat général de la défense et de la sécurité nationale)
- ✅ Archives nationales
- ✅ Données publiques françaises (data.gouv.fr)

**Conditions** :
- ✅ Crawling autorisé
- ✅ Réutilisation commerciale autorisée
- ⚠️ Attribution : "Source: [Nom institution]"
- ⚠️ Rate limiting : 1 req/s recommandé
- ✅ Respecter `robots.txt`

**Références** :
- [Code des relations entre le public et l'administration, Art. L321-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033218936)

---

### 🇪🇺 Union Européenne - Open Data Directive

**Base légale** : [Directive (EU) 2019/1024](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L1024)

**Providers concernés** :
- ✅ EEAS (European External Action Service)
- ✅ EDA (European Defence Agency)
- ✅ ENISA (EU Cybersecurity Agency)

**Conditions** :
- ✅ Crawling autorisé
- ✅ Réutilisation commerciale autorisée
- ⚠️ Rate limiting : 1 req/s recommandé
- ✅ Respecter `robots.txt`

---

### 🌍 Organisations Internationales - Open Access

#### IMF (International Monetary Fund)
**Licence** : [IMF Copyright and Usage](https://www.imf.org/external/terms.htm)
- ✅ Publications : Domaine public (sauf mention contraire)
- ✅ Datasets : Open Data Initiative
- ⚠️ Attribution obligatoire
- ⚠️ APIs officielles disponibles (préférer aux scrapes)

#### World Bank
**Licence** : [Creative Commons CC-BY 4.0](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets)
- ✅ Open Knowledge Repository : CC-BY
- ✅ Données : Open Data
- ⚠️ Attribution obligatoire

#### OECD
**Licence** : [OECD Terms & Conditions](https://www.oecd.org/termsandconditions/)
- ✅ Publications : Usage libre (sauf mention contraire)
- ⚠️ Vérifier licence par document
- ⚠️ Attribution obligatoire

#### BIS (Bank for International Settlements)
**Licence** : Domaine public (organisation internationale)
- ✅ Publications : Libre accès
- ⚠️ Attribution recommandée

#### Nations Unies (UN, UNDP, UNCTAD)
**Licence** : [UN Copyright](https://www.un.org/en/about-us/copyright)
- ✅ Documents officiels : Usage libre pour recherche
- ⚠️ Attribution obligatoire
- ⚠️ Usage commercial : demander autorisation pour certains contenus

---

### 🛡️ NATO
**Licence** : [NATO Intellectual Property](https://www.nato.int/cps/en/natolive/copyright.htm)
- ✅ Publications publiques : Usage libre
- ⚠️ Documents classifiés : INTERDIT
- ⚠️ Attribution obligatoire
- ⚠️ Rate limiting : 1 req/s

---

## ⚠️ RÈGLES OPÉRATIONNELLES

### Rate Limiting (OBLIGATOIRE)

**Implémentation** :
```typescript
const RATE_LIMITS = {
  'odni': 1000,        // 1 req/s
  'cia-foia': 2000,    // 1 req/2s (serveur lent)
  'nato': 1000,
  'imf': 1000,
  'worldbank': 1000,
  // ... etc
};
```

**Pénalités non-respect** :
- Bannissement IP (temporaire ou permanent)
- Risque légal (violation ToS)
- Réputation NomosX compromise

### User-Agent (OBLIGATOIRE)

**Format requis** :
```
NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)
```

**Justification** :
- Transparence (identifier le crawler)
- Contact en cas de problème
- Conformité robots.txt

### Robots.txt (RESPECT ABSOLU)

**Vérification avant crawl** :
```bash
curl https://www.dni.gov/robots.txt
curl https://www.nato.int/robots.txt
# etc.
```

**Action si Disallow** :
- ❌ Ne PAS crawler les paths interdits
- ✅ Utiliser APIs officielles si disponibles
- ✅ Contacter l'institution pour autorisation

---

## 🚫 SOURCES INTERDITES

### ❌ Think Tanks Privés (Copyright)
- RAND Corporation (paywall)
- Brookings Institution (selective access)
- Council on Foreign Relations (membership requis)
- → **Seulement si open access explicite**

### ❌ Services Nécessitant Authentification
- Classified briefings
- Internal memos
- Subscriber-only content

### ❌ Scraping Agressif
- > 1 req/s par domaine
- Bulk downloads sans autorisation
- Contournement de paywalls

---

## 📋 CHECKLIST PRÉ-DÉPLOIEMENT

Avant d'activer un nouveau provider :

- [ ] Vérifier licence légale (domaine public / open data / CC-BY)
- [ ] Lire `robots.txt` du domaine
- [ ] Lire Terms of Service (ToS)
- [ ] Implémenter rate limiting (≤ 1 req/s)
- [ ] Configurer User-Agent approprié
- [ ] Tester avec 1-2 requêtes manuelles
- [ ] Logger toutes les erreurs HTTP (429, 403, etc.)
- [ ] Documenter dans ce fichier

---

## 📞 CONTACTS EN CAS DE BLOCAGE

Si un provider bloque NomosX :

1. **Vérifier conformité** :
   - Rate limiting respecté ?
   - User-Agent correct ?
   - Robots.txt respecté ?

2. **Contacter l'institution** :
   - Email : [contact trouvé sur site]
   - Sujet : "Research bot compliance inquiry - NomosX"
   - Expliquer : Think tank IA, usage académique, conformité légale

3. **Alternatives** :
   - Chercher API officielle
   - Demander accès bulk data
   - Partenariat institutionnel

---

## 🔄 RÉVISION

Ce document doit être révisé :
- **Trimestriellement** (changements législatifs)
- **Avant ajout de nouveau provider**
- **Si blocage/incident légal**

**Dernière révision** : 2026-01-23  
**Prochaine révision** : 2026-04-23

---

**Responsable légal** : CTO NomosX  
**Contact** : legal@nomosx.com
