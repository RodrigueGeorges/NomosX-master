#!/bin/bash

echo "🔍 OpenClaw Pre-Deployment Check"
echo "=============================="

# Vérifier les erreurs TypeScript
echo "📊 Checking TypeScript errors..."
npm run build 2>&1 | grep -E "(error|Error)" || echo "✅ No TypeScript errors found"

# Vérifier les dépendances
echo "📦 Checking dependencies..."
npm ls --depth=0 || echo "⚠️ Some dependency issues found"

# Vérifier la configuration
echo "⚙️ Checking configuration..."
test -f netlify.toml && echo "✅ netlify.toml exists" || echo "❌ netlify.toml missing"
test -f next.config.cjs && echo "✅ next.config.cjs exists" || echo "❌ next.config.cjs missing"

echo "✅ Pre-deployment check complete!"