# ==========================================
# 🚀 NomosX - Setup Database Script
# ==========================================
# Ce script configure la base de données PostgreSQL

Write-Host "🚀 NomosX - Configuration de la base de données" -ForegroundColor Cyan
Write-Host ""

# Vérifie si .env existe
if (-Not (Test-Path ".env")) {
    Write-Host "❌ Fichier .env introuvable!" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Crée un fichier .env avec au minimum:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx" -ForegroundColor White
    Write-Host "OPENAI_API_KEY=sk-proj-..." -ForegroundColor White
    Write-Host "ADMIN_KEY=mon-secret-admin-123" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Consulte QUICK_START.md pour plus de détails" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Fichier .env trouvé" -ForegroundColor Green
Write-Host ""

# Étape 1 : Génération du client Prisma
Write-Host "📦 Génération du client Prisma..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Échec de la génération du client Prisma" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Client Prisma généré" -ForegroundColor Green
Write-Host ""

# Étape 2 : Application des migrations
Write-Host "🔄 Application des migrations..." -ForegroundColor Cyan
npx prisma migrate dev --name init
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Les migrations ont échoué" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Solutions possibles:" -ForegroundColor Yellow
    Write-Host "   1. Vérifie que PostgreSQL est démarré" -ForegroundColor White
    Write-Host "   2. Vérifie que DATABASE_URL est correct dans .env" -ForegroundColor White
    Write-Host "   3. Essaie: npx prisma migrate reset (⚠️  efface les données)" -ForegroundColor White
    exit 1
}
Write-Host "✅ Migrations appliquées" -ForegroundColor Green
Write-Host ""

# Étape 3 : Vérification de la connexion
Write-Host "🔍 Vérification de la connexion..." -ForegroundColor Cyan
npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Impossible de se connecter à la base de données" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Connexion réussie" -ForegroundColor Green
Write-Host ""

# Étape 4 : Prisma Studio (optionnel)
Write-Host "🎉 Configuration terminée!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Veux-tu ouvrir Prisma Studio pour voir la base de données?" -ForegroundColor Cyan
Write-Host "   (Appuie sur Entrée pour continuer, ou Ctrl+C pour annuler)" -ForegroundColor Yellow
$null = Read-Host
npx prisma studio

Write-Host ""
Write-Host "✅ Tout est prêt!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "   1. npm run dev          # Lance l'application" -ForegroundColor White
Write-Host "   2. http://localhost:3000/settings  # Configure un topic" -ForegroundColor White
Write-Host "   3. npm run worker       # Traite les jobs" -ForegroundColor White
Write-Host ""
