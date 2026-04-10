@echo off
echo 🚀 Démarrage OpenClaw Gateway Mode Portable
echo.

REM Vérifier Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js non installé
    pause
    exit /b 1
)

REM Démarrer le serveur gateway
echo 🔧 Démarrage serveur gateway...
cd /d "%~dp0.."
node lib/gateway/portable-server.js

if errorlevel 1 (
    echo ❌ Erreur démarrage gateway
    pause
    exit /b 1
) else (
    echo ✅ Gateway démarré en mode portable
    echo 🌐 API: http://localhost:3001
    echo 📊 Monitoring: http://localhost:3001/health
    pause
)
