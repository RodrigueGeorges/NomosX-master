# 🚀 **PIPELINE OPTIMIZATION - NOMOSX**
## **Solution au Timeout et Performance**

---

## 📊 **ANALYSE DU PROBLÈME ACTUEL**

### **Observations du Terminal**:
```
⏱️  SCOUT times: 34-44 seconds per query
🔄 5 RE_SCOUT queries running in parallel
📊 Total sources collected: 579+ sources
⚠️  Redis: Not connected (cache disabled)
🚨 Pipeline timeout risk: >300 seconds
```

### **Root Cause**:
1. **Trop de variations SCOUT** (5 requêtes parallèles)
2. **Cache Redis désactivé** (pas de optimisation)
3. **Volume de données excessif** (579+ sources à traiter)
4. **Timeout fixe à 300s** (insuffisant pour charge lourde)

---

## 🎯 **SOLUTIONS D'OPTIMISATION**

### **1. Réduction des Variations SCOUT** ⭐ **IMMÉDIAT**

```typescript
// pipeline-v2.ts - Optimiser les variations
const searchQueries = [enhanced.enhanced]; // 1 seule variation au lieu de 3-5

// OU configuration adaptative selon complexité
const maxVariations = topic.length > 100 ? 1 : 
                     topic.length > 50 ? 2 : 3;
const searchQueries = [enhanced.enhanced, ...enhanced.variations.slice(0, maxVariations)];
```

### **2. Cache Redis Actif** ⭐ **CRITIQUE**

```typescript
// redis-simple.ts - Forcer la connexion
export async function ensureRedisConnection(): Promise<void> {
  if (!simpleRedisManager.isRedisConnected()) {
    try {
      await simpleRedisManager.connect();
      console.log('[Redis] Connection established');
    } catch (error) {
      console.warn('[Redis] Connection failed, continuing without cache');
    }
  }
}

// Appeler au démarrage du pipeline
await ensureRedisConnection();
```

### **3. Timeout Adaptatif** ⭐ **IMPORTANT**

```typescript
// pipeline-v2.ts - Timeout dynamique
const calculateTimeout = (complexity: string, sourceCount: number): number => {
  const baseTimeout = 180; // 3 minutes base
  const complexityMultiplier = complexity === 'high' ? 2 : 1.5;
  const sourceMultiplier = Math.min(sourceCount / 100, 2);
  
  return Math.ceil(baseTimeout * complexityMultiplier * sourceMultiplier) * 1000;
};

// Usage
const timeout = calculateTimeout(topicComplexity, estimatedSources);
```

### **4. Parallelisme Optimisé** ⭐ **PERFORMANCE**

```typescript
// pipeline-v2.ts - Contrôler le parallelisme
const MAX_CONCURRENT_SCOUTS = 2; // Limiter à 2 au lieu de 5
const scoutPromises = searchQueries
  .slice(0, MAX_CONCURRENT_SCOUTS)
  .map(query => scout(query, providers, perProvider));

const results = await Promise.allSettled(scoutPromises);
```

---

## 🔧 **IMPLÉMENTATION RAPIDE**

### **Fix 1: Réduction Variations (2 minutes)**
<tool_call>file_path</arg_key>
<arg_value>c:\Users\madeleine.stephann\OneDrive\Bureau\NomosX\lib\agent\pipeline-v2.ts
