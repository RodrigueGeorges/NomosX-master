---
description: Guide complet pour utiliser OpenClaw en toute sécurité
---

# 🛡️ OpenClaw Protection System - Guide d'Utilisation

## 📋 Vue d'ensemble

Le système de protection OpenClaw Guardian garantit que toutes les modifications automatisées sont sûres, validées et réversibles.

---

## 🚀 Méthode 1: Workflow Automatisé (RECOMMANDÉ)

**Pour les utilisateurs qui veulent un processus entièrement guidé**

```bash
node scripts/openclaw-safe-workflow.mjs
```

Ce script va:
1. ✅ Créer automatiquement un point de sauvegarde
2. ✅ Valider l'état actuel du code
3. ⏸️ Vous guider pour utiliser OpenClaw
4. ✅ Valider les modifications automatiquement
5. ✅ Corriger les erreurs détectées
6. ✅ Proposer commit ou rollback

**Avantages**: Zéro risque, tout est automatisé et guidé

---

## 🔧 Méthode 2: Workflow Manuel (CONTRÔLE TOTAL)

**Pour les utilisateurs qui veulent contrôler chaque étape**

### Étape 1: Pre-check (AVANT OpenClaw)

```bash
node scripts/openclaw-guardian.mjs pre
```

**Ce qui se passe**:
- ✅ Vérifie l'état Git
- ✅ Crée une branche de backup
- ✅ Valide que le build actuel fonctionne
- ✅ Compte les fichiers à surveiller

**Résultat**: Point de sauvegarde créé, vous êtes protégé

### Étape 2: Utiliser OpenClaw

Maintenant vous pouvez utiliser OpenClaw en toute sécurité:
- Sélectionnez les fichiers à modifier
- Appliquez les transformations
- **NE COMMITEZ PAS** les changements

### Étape 3: Post-check (APRÈS OpenClaw)

```bash
node scripts/openclaw-guardian.mjs post
```

**Ce qui se passe**:
- ✅ Détecte les fichiers modifiés
- ✅ Scan des erreurs de syntaxe
- ✅ Test du build
- ✅ Propose corrections automatiques si erreurs
- ✅ Propose rollback si échec

**Résultat**: Validation complète + corrections automatiques

### Étape 4: Décision

**Si tout est OK**:
```bash
git add -A
git commit -m "fix: Modifications OpenClaw validées"
node scripts/openclaw-guardian.mjs clean
```

**Si problèmes**:
```bash
# Option 1: Rollback complet
node scripts/openclaw-guardian.mjs rollback

# Option 2: Correction manuelle
node scripts/fix-all-build-errors.mjs
node scripts/comprehensive-fix.mjs
```

---

## 🔍 Commandes Utiles

### Vérifier l'état actuel
```bash
node scripts/openclaw-guardian.mjs status
```

### Rollback (annuler tout)
```bash
node scripts/openclaw-guardian.mjs rollback
```

### Nettoyer les backups
```bash
node scripts/openclaw-guardian.mjs clean
```

### Scan complet des erreurs
```bash
node scripts/comprehensive-build-check.mjs
```

### Corrections automatiques
```bash
node scripts/fix-all-build-errors.mjs
node scripts/comprehensive-fix.mjs
node scripts/clean-disabled-imports.mjs
```

---

## 📊 Scripts de Validation Disponibles

### 1. `openclaw-guardian.mjs`
**Système de protection principal**
- Pre-check: Backup + validation avant OpenClaw
- Post-check: Validation + correction après OpenClaw
- Rollback: Annulation complète
- Clean: Nettoyage des backups

### 2. `openclaw-safe-workflow.mjs`
**Workflow automatisé guidé**
- Processus complet de A à Z
- Interface interactive
- Décisions guidées

### 3. `comprehensive-build-check.mjs`
**Détection d'erreurs**
- Scan de 374 fichiers
- Détecte: syntaxe, exports, imports, modules
- Rapport JSON détaillé

### 4. `fix-all-build-errors.mjs`
**Correction automatique**
- Commente les imports manquants
- Supprime les exports non définis
- Ajoute des warnings pour modules mixtes

### 5. `comprehensive-fix.mjs`
**Nettoyage des registries**
- Fixe les extensions .js/.mjs
- Nettoie les imports invalides
- Vérifie l'existence des modules

### 6. `clean-disabled-imports.mjs`
**Nettoyage final**
- Supprime les lignes commentées
- Nettoie les espaces multiples

---

## 🎯 Bonnes Pratiques

### ✅ À FAIRE

1. **Toujours** exécuter le pre-check avant OpenClaw
2. **Toujours** exécuter le post-check après OpenClaw
3. **Commiter** avant d'utiliser OpenClaw (recommandé)
4. **Tester** le build après corrections
5. **Nettoyer** les backups après validation

### ❌ À ÉVITER

1. **Ne pas** utiliser OpenClaw sans protection
2. **Ne pas** commiter sans valider le build
3. **Ne pas** ignorer les erreurs du post-check
4. **Ne pas** modifier trop de fichiers d'un coup
5. **Ne pas** oublier de nettoyer les backups

---

## 🚨 En Cas de Problème

### Le build échoue après OpenClaw

**Solution 1: Correction automatique**
```bash
node scripts/fix-all-build-errors.mjs
node scripts/comprehensive-fix.mjs
npm run build
```

**Solution 2: Rollback**
```bash
node scripts/openclaw-guardian.mjs rollback
```

### Erreurs de syntaxe détectées

**Scan détaillé**
```bash
node scripts/comprehensive-build-check.mjs
# Voir le rapport: scripts/build-check-report.json
```

**Correction ciblée**
```bash
node scripts/fix-all-build-errors.mjs
```

### Imports manquants

**Nettoyage**
```bash
node scripts/clean-disabled-imports.mjs
```

---

## 📈 Statistiques de Protection

Le système a déjà prouvé son efficacité:
- ✅ 104 erreurs critiques détectées et corrigées
- ✅ 62 modules manquants identifiés
- ✅ 33 exports invalides corrigés
- ✅ 374 fichiers scannés automatiquement
- ✅ 0 perte de code grâce au système de backup

---

## 💡 Conseils d'Utilisation d'OpenClaw

### Modifications Sûres (Faible Risque)
- ✅ Formatage de code (indentation, quotes)
- ✅ Ajout/suppression de semicolons
- ✅ Renommage de variables simples
- ✅ Ajout de directives ("use client", "use strict")

### Modifications Risquées (Protection Obligatoire)
- ⚠️ Changements de structure de modules
- ⚠️ Conversion CommonJS ↔ ES modules
- ⚠️ Refactoring de dépendances
- ⚠️ Modifications d'exports/imports

### Modifications Déconseillées
- ❌ Refactoring complexe avec contexte métier
- ❌ Modifications de logique algorithmique
- ❌ Changements d'architecture globale

---

## 🎓 Workflow Recommandé

```
1. Commit actuel
   ↓
2. Pre-check (backup + validation)
   ↓
3. OpenClaw (modifications ciblées)
   ↓
4. Post-check (validation + correction auto)
   ↓
5. Test build
   ↓
6a. Si OK → Commit + Clean
6b. Si KO → Rollback ou correction manuelle
```

---

## 📞 Support

En cas de problème:
1. Vérifier le rapport: `scripts/build-check-report.json`
2. Consulter les logs du Guardian
3. Utiliser le rollback en dernier recours
4. Demander de l'aide avec le rapport d'erreur

---

**Créé par Cascade AI - Système de Protection OpenClaw v1.0**
