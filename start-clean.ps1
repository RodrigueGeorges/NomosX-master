# NomosX - Clean Start Script
# Lance l'application avec un environnement propre

Write-Host "🚀 NomosX V1.1 - Clean Start" -ForegroundColor Cyan
Write-Host ""

# Vérifier Node.js
Write-Host "✓ Checking Node.js..." -ForegroundColor Green
node --version
npm --version
Write-Host ""

# Nettoyer le cache Next.js
Write-Host "🧹 Cleaning Next.js cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next
    Write-Host "  ✓ .next removed" -ForegroundColor Green
}
Write-Host ""

# Vérifier les dépendances
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    npm install
}
Write-Host "  ✓ Dependencies OK" -ForegroundColor Green
Write-Host ""

# Générer Prisma Client
Write-Host "🔧 Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate --silent
Write-Host "  ✓ Prisma Client generated" -ForegroundColor Green
Write-Host ""

# Démarrer le serveur
Write-Host "🎯 Starting development server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Once you see '✓ Ready', visit:" -ForegroundColor White
Write-Host ""
Write-Host "  → Radar:    http://localhost:3000" -ForegroundColor Green
Write-Host "  → Settings: http://localhost:3000/settings" -ForegroundColor Green
Write-Host "  → Showcase: http://localhost:3000/design-showcase" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

npm run dev
