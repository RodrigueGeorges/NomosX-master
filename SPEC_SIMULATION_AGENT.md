# Spec — Simulation Agent (NomosX-native)

**Date** : 22 mai 2026
**Status** : DRAFT — Spec de conception, **pas encore implémenté**
**Auteur** : Cascade (CTO mode)
**Inspiration conceptuelle** : MiroFish (AGPL-3.0, NON intégré directement)
**Licence cible** : Code propriétaire NomosX

---

## 1. Pourquoi ce module

### 1.1 Problème actuel

`strategic-analyst-agent.ts` produit déjà des **scenarios** dans la section `scenarios` de son output :

```typescript
scenarios: Array<{
  name: string;
  probability: number;        // ⚠️ LLM-guessed, pas empirique
  description: string;
  implications: string;
  signals: string[];
}>;
```

**Limite réelle** : ces `probability` sont des estimations LLM produites en une seule passe par le Strategic Analyst. Elles **ne sont pas testées** contre des dynamiques d'interaction entre stakeholders. C'est une faiblesse vs. les vrais think tanks (qui font du wargaming, des sondages d'experts, des simulations).

### 1.2 Pourquoi NomosX a besoin de ce module

- **Différenciation marché** vs. Perplexity / Consensus / ChatGPT (ils ne font pas de simulation)
- **Renforce** le pricing Strategic Tier (€8-15 par rapport) — c'est ce qui le justifie
- **Ferme la boucle** "qu'est-ce qui est vrai (synthesis) → qu'est-ce qui pourrait arriver (simulation)"
- **Asset défendable** : pas de concurrent SaaS qui couple littérature académique + simulation multi-agent à ce prix

### 1.3 Pourquoi pas MiroFish directement

`MiroFish` est sous **licence AGPL-3.0**. Conséquences :
- Intégration directe → NomosX devient AGPL → tout le code source devient public → perte du moat technique
- Microservice externe via API → zone grise juridique (AGPL §13 cible exactement ce contournement)
- **Décision CTO** : construire un équivalent maison, inspiré du concept mais sans toucher au code

Le concept (swarm de personas avec mémoire/persona qui interagissent et évoluent) n'est **pas brevetable**. C'est une architecture, pas une invention. Clean-room reimplementation = 100% safe.

---

## 2. Architecture

### 2.1 Pipeline d'intégration

```
Strategic Analyst produit scenarios bruts
    ↓
[NOUVEAU] Simulation Agent
    ↓ génère panel de stakeholders synthétiques (personas)
    ↓ fait jouer N rounds d'interaction
    ↓ mesure trajectoires + probabilités empiriques
    ↓
Strategic Analyst v2 (ré-injection)
    ↓ enrichit chaque scenario avec probabilité empirique + dynamiques observées
    ↓
Editor → Rapport final avec section "Simulated Outcomes"
```

### 2.2 Décomposition fonctionnelle

```
lib/agent/simulation-agent.ts
  ├─ buildPersonaPanel()         → génère 20-50 stakeholders synthétiques
  ├─ runSimulation()             → N rounds d'interaction (10-30 ticks)
  ├─ computeTrajectories()       → analyse les dynamiques observées
  ├─ deriveEmpiricalProbabilities() → probabilités basées sur fréquence d'atteinte
  └─ exportSimulationReport()    → format consommable par strategic-analyst v2
```

### 2.3 Modèle de persona

```typescript
interface StakeholderPersona {
  id: string;
  archetype: "regulator" | "industry" | "academic" | "ngo" | "media" | "public" | "investor" | "...";
  domain: string;                         // hérité du contexte (ex: "AI policy")
  values: Record<string, number>;         // 0-1 : sécurité, innovation, équité, profit...
  beliefs: string[];                      // narrative beliefs initiaux
  memory: Array<{ tick: number; observation: string }>;  // mémoire courte
  influencedBy: string[];                 // IDs des autres personas qu'il écoute
  influence: number;                      // poids 0-1 dans l'écosystème
  llmProfile: {
    systemPrompt: string;                 // injection persona dans LLM call
    temperature: number;                  // 0.3-0.8 selon archetype
  };
}
```

### 2.4 Modèle de simulation

```typescript
interface SimulationConfig {
  scenarios: Scenario[];                  // depuis strategic-analyst
  personas: StakeholderPersona[];
  ticks: number;                          // 10-30 rounds (défaut 15)
  llmCalls: number;                       // budget LLM hard cap (défaut 200)
  domain: string;
}

interface SimulationTick {
  tick: number;
  events: Array<{
    personaId: string;
    action: "speak" | "react" | "shift_position" | "form_coalition";
    target?: string;
    content: string;
    cost: number;                         // USD LLM
  }>;
  scenarioStates: Record<string, {
    momentum: number;                     // -1 à +1
    supporters: string[];                 // persona IDs
    opponents: string[];
  }>;
}

interface SimulationOutput {
  scenarios: Array<{
    name: string;
    empiricalProbability: number;         // 0-1 basé sur fréquence d'atteinte
    trajectory: "rising" | "stable" | "declining" | "volatile";
    keyDrivers: string[];                 // personas/events qui ont porté le scenario
    blockers: string[];
    cascadeEffects: string[];
    confidenceInterval: [number, number]; // IC 90% via bootstrap
  }>;
  ticks: SimulationTick[];
  totalCostUsd: number;
  totalDurationMs: number;
}
```

### 2.5 Algorithme de simulation (round)

1. **Initialisation** : personas placés sur des positions initiales par rapport à chaque scenario
2. **Pour chaque tick (1 à N)** :
   - Sélectionne 3-5 personas actifs (pondéré par `influence`)
   - Chaque persona génère via LLM une action (speak / react / shift / form_coalition) en tenant compte de :
     - Son `systemPrompt`
     - Sa `memory` récente
     - Ce qu'ont dit ses `influencedBy` au tick précédent
     - L'état courant des scenarios
   - Les personas voisins ajustent leurs positions (influence sociale, modèle DeGroot/Friedkin-Johnsen)
   - Le `momentum` de chaque scenario est mis à jour
3. **Convergence** : si momentum stable sur 3 ticks consécutifs, arrêt anticipé
4. **Probabilité empirique** : ratio de ticks où le scenario a momentum > 0.5

### 2.6 Coût et performance estimés

| Métrique | Cible |
|---|---|
| Personas | 20-30 par défaut |
| Ticks | 15 par défaut |
| LLM calls totaux | ~150-300 (gpt-4o-mini surtout, gpt-4o pour synthèse finale) |
| Coût USD par simulation | **$2-5** (cible) |
| Durée | 60-120s |
| Cache Redis | Personas réutilisables par domaine, 7j TTL |

→ **Intégration uniquement en Strategic Tier** ($8-15) où le coût est absorbé.

---

## 3. Intégration dans le pipeline

### 3.1 Hook dans `pipeline-v2.ts`

Nouvel étape **7.5** entre `Analyst` et `Harvard Council` :

```
7.   ANALYST          → strategic-analyst produces scenarios
7.5. SIMULATION       → simulation-agent enriches scenarios with empirical probs  ← NEW
8.   HARVARD COUNCIL  → 22 PhD experts now see empirical scenarios
```

### 3.2 Conditions d'activation

```typescript
// Dans runPipeline()
const enableSimulation =
  mode === "strategic" &&
  scenarios.length >= 2 &&
  budget.remaining > 5 &&  // au moins $5 de budget restant
  !cfg.disableSimulation;
```

### 3.3 Format de sortie injecté

Le Strategic Analyst v2 voit dans son contexte :

```
=== SIMULATED OUTCOMES (empirical, 15 ticks, 25 personas) ===
Scenario A: "Strict AI regulation by 2027"
  - Empirical probability: 0.42 (CI: [0.35, 0.49])
  - Trajectory: rising
  - Key drivers: regulator-EU, ngo-AI-Safety, academic-Tegmark
  - Blockers: industry-FAANG, investor-VC
  - Cascade: triggers (B) "Sectoral compliance market $50B"

Scenario B: ...
```

→ L'Analyst peut maintenant écrire "Notre simulation multi-agent (25 stakeholders, 15 rounds) suggère P=0.42 pour ce scenario, porté principalement par..."

---

## 4. Réutilisation de l'existant

| Asset NomosX | Réutilisation |
|---|---|
| `EXPERT_PERSONAS` (22 PhD) | ✅ Source pour personas "academic" archetype |
| `RESEARCHER_REGISTRY` (researcher-ownership) | ✅ Pour pondération influence par domaine |
| `unified-llm.ts` | ✅ LLM calls + retry + cost tracking |
| `agent-memory.ts` | ✅ Calibration des seuils de momentum |
| `knowledge-graph.ts` | ✅ Stakeholders extraits du KG (mentionnés dans publications passées) |
| `cohere-reranker.ts` | ❌ Pas utilisé ici |

**Aucun nouveau service externe à ajouter.** Tout en TypeScript, dans le repo NomosX.

---

## 5. Différenciation marketing

### Pitch face à Perplexity / Consensus

> "Perplexity vous dit ce qui a été dit. Consensus vous dit ce que la littérature pense. NomosX vous dit **ce qui va probablement se passer** — basé sur une simulation multi-agent de 25 stakeholders qui jouent votre futur."

### Section dédiée dans le rapport Strategic

```markdown
## 6. Simulated Outcomes

Notre **simulation multi-agent** a fait jouer 25 stakeholders synthétiques
(régulateurs, industriels, académiques, ONG, médias) sur 15 rounds d'interaction.

Résultats empiriques :

| Scenario | P empirique | Tendance | Drivers principaux |
|---|---|---|---|
| Strict regulation by 2027 | **0.42** | ↗ rising | EU regulator, AI Safety NGOs |
| Voluntary industry standards | 0.31 | → stable | FAANG, VC investors |
| Status quo extended | 0.18 | ↘ declining | — |
| Crisis-triggered overreach | 0.09 | volatile | Black swan dependent |

[Voir trajectoires détaillées →]
```

C'est **le genre de visuel qu'un cabinet de conseil facture €50K**. NomosX le produit en 90 secondes pour $3.

---

## 6. Risques et limites

| Risque | Mitigation |
|---|---|
| Probabilités empiriques restent biaisées par les system prompts | Run 3x avec seeds différents → IC bootstrap |
| Coût LLM dérape | Hard cap budget par run + circuit breaker |
| Personas génèrent du roleplay creux | Injection forte des values + beliefs initiaux + mémoire |
| Sur-promesse marketing ("nous prédisons le futur") | Communiquer "scenarios pondérés", pas "prédiction" |
| Garbage in / garbage out si scenarios initiaux mauvais | La simulation ne crée pas — elle teste. Strategic Analyst reste source de vérité |

---

## 7. Roadmap implémentation

### Phase 1 (1 semaine) — Skeleton
- [ ] `simulation-agent.ts` créé avec interfaces
- [ ] `buildPersonaPanel()` minimal (5 archetypes)
- [ ] Test unitaire avec scenario hardcodé

### Phase 2 (1 semaine) — Core loop
- [ ] `runSimulation()` avec 15 ticks
- [ ] LLM calls intégrés via `unified-llm.ts`
- [ ] Budget cap + retry + tracking

### Phase 3 (1 semaine) — Empirical analysis
- [ ] `computeTrajectories()` + momentum scoring
- [ ] `deriveEmpiricalProbabilities()` avec bootstrap CI
- [ ] Cache Redis personas par domaine

### Phase 4 (1 semaine) — Pipeline integration
- [ ] Hook entre Analyst et Harvard Council
- [ ] Strategic Analyst v2 prompt mis à jour pour consommer simulation output
- [ ] Composant front `<ScenarioSimulation>` avec graphe trajectoires

### Phase 5 (1 semaine) — Polish + Marketing
- [ ] Page landing "Simulated Outcomes" feature
- [ ] Documentation utilisateur
- [ ] A/B test pricing Strategic Tier avec/sans simulation

**Total estimé** : 5 semaines pour un module qui justifie à lui seul le pricing Strategic Tier et différencie franchement NomosX du marché.

---

## 8. Décision à prendre

| Décision | Recommandation CTO |
|---|---|
| Valider la spec ? | ✅ Oui |
| Démarrer Phase 1 ? | 🟡 Après Sprint 1-3 (purge, typage, refonte DA) |
| Renommer "Simulation Agent" → "Foresight Engine" pour le marketing ? | ⚠️ À tester avec utilisateurs |
| Garder le nom de code MiroFish dans les commits ? | ❌ Non — risque d'attribution involontaire, on est en clean-room |

---

*Spec produite par Cascade en mode CTO. À valider avant développement.*
