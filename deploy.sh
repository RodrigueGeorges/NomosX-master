#!/bin/bash

echo "🚀 OpenClaw Netlify Deployment Script"
echo "====================================="

# 1. Nettoyer le cache
echo "🧹 Cleaning cache..."
rm -rf .next
rm -rf out
rm -rf node_modules/.cache

# 2. Installer les dépendances
echo "📦 Installing dependencies..."
npm ci

# 3. Build pour production
echo "🔨 Building for production..."
npm run build

# 4. Déployer sur Netlify
echo "🚀 Deploying to Netlify..."
netlify deploy --prod

echo "✅ Deployment complete!"
echo "🌐 Your app is live at: https://nomosx.netlify.app"