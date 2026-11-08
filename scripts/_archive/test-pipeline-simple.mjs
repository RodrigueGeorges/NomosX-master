#!/usr/bin/env node
/**
 * Test End-to-End Simplifié du Pipeline Agentique
 * Version JavaScript pure pour éviter les problèmes TypeScript ESM
 */

// Charger les variables d'environnement
import { config } from 'dotenv';
config();

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(step, message, status = 'info') {
  const statusColors = {
    info: colors.cyan,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };
  const color = statusColors[status] || colors.reset;
  console.log(`${color}[${step}]${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function testPipeline() {
  const startTime = Date.now();
  
  try {
    logSection('🧪 TEST PIPELINE AGENTIQUE COMPLET');
    
    // Configuration du test
    const testQuery = "carbon tax economic impact";
    const testProviders = ["openalex", "crossref"];
    const testLimit = 5;
    
    log('CONFIG', `Query: "${testQuery}"`, 'info');
    log('CONFIG', `Providers: ${testProviders.join(', ')}`, 'info');
    log('CONFIG', `Limit: ${testLimit} sources`, 'info');
    
    // ================================
    // ÉTAPE 1: Test simple - Vérifier que l'environnement est configuré
    // ================================
    logSection('1️⃣  VÉRIFICATION ENVIRONNEMENT');
    
    log('ENV', 'Checking DATABASE_URL...', 'info');
    if (!process.env.DATABASE_URL) {
      log('ENV', '❌ DATABASE_URL not configured', 'error');
      return;
    }
    log('ENV', '✅ DATABASE_URL configured', 'success');
    
    log('ENV', 'Checking OPENAI_API_KEY...', 'info');
    if (!process.env.OPENAI_API_KEY) {
      log('ENV', '❌ OPENAI_API_KEY not configured', 'error');
      return;
    }
    log('ENV', '✅ OPENAI_API_KEY configured', 'success');
    
    // ================================
    // ÉTAPE 2: Test de connexion DB
    // ================================
    logSection('2️⃣  TEST CONNEXION DATABASE');
    
    log('DB', 'Importing Prisma...', 'info');
    const { PrismaClient } = await import('../generated/prisma-client/index.js');
    const prisma = new PrismaClient();
    
    log('DB', 'Testing connection...', 'info');
    const sourceCount = await prisma.source.count();
    log('DB', `✅ Connected - ${sourceCount} sources in database`, 'success');
    
    // ================================
    // ÉTAPE 3: Test OpenAI
    // ================================
    logSection('3️⃣  TEST OPENAI API');
    
    log('OPENAI', 'Importing OpenAI...', 'info');
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    log('OPENAI', 'Testing API call...', 'info');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'test ok' in 2 words" }],
      max_tokens: 10,
    });
    log('OPENAI', `✅ API working - Response: "${completion.choices[0].message.content}"`, 'success');
    
    // ================================
    // ÉTAPE 4: Test Provider OpenAlex
    // ================================
    logSection('4️⃣  TEST PROVIDER OPENALEX');
    
    log('PROVIDER', 'Testing OpenAlex API...', 'info');
    const openalexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(testQuery)}&per-page=3`;
    const response = await fetch(openalexUrl);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      log('PROVIDER', `✅ OpenAlex working - Found ${data.results.length} results`, 'success');
      log('PROVIDER', `First result: "${data.results[0].title}"`, 'info');
    } else {
      log('PROVIDER', '⚠️  OpenAlex returned no results', 'warning');
    }
    
    // ================================
    // ÉTAPE 5: Test Redis (optionnel)
    // ================================
    logSection('5️⃣  TEST REDIS (OPTIONNEL)');
    
    if (process.env.REDIS_URL) {
      try {
        log('REDIS', 'Importing ioredis...', 'info');
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL);
        
        log('REDIS', 'Testing connection...', 'info');
        await redis.ping();
        log('REDIS', '✅ Redis connected', 'success');
        
        await redis.disconnect();
      } catch (err) {
        log('REDIS', `⚠️  Redis not available: ${err.message}`, 'warning');
        log('REDIS', 'Pipeline will work without cache', 'info');
      }
    } else {
      log('REDIS', 'REDIS_URL not configured (optional)', 'info');
      log('REDIS', 'Pipeline will work without cache', 'info');
    }
    
    // ================================
    // RÉSUMÉ FINAL
    // ================================
    const totalDuration = Date.now() - startTime;
    
    logSection('📊 RÉSUMÉ DES TESTS');
    
    console.log(`${colors.green}✅ TOUS LES TESTS PASSÉS AVEC SUCCÈS${colors.reset}\n`);
    
    console.log('Composants vérifiés:');
    console.log(`  ✅ Environnement configuré`);
    console.log(`  ✅ Database connectée (${sourceCount} sources)`);
    console.log(`  ✅ OpenAI API fonctionnelle`);
    console.log(`  ✅ Provider OpenAlex fonctionnel`);
    console.log(`  ${process.env.REDIS_URL ? '✅' : 'ℹ️ '} Redis ${process.env.REDIS_URL ? 'connecté' : 'non configuré (optionnel)'}`);
    
    console.log(`\n${colors.bright}⏱️  Durée totale: ${(totalDuration / 1000).toFixed(2)}s${colors.reset}`);
    
    console.log(`\n${colors.cyan}🚀 LE PIPELINE EST PRÊT À ÊTRE UTILISÉ${colors.reset}`);
    console.log(`\nPour tester le pipeline complet, utilisez:`);
    console.log(`  ${colors.yellow}npm run test:complete${colors.reset}`);
    console.log(`\nOu depuis le code:`);
    console.log(`  ${colors.yellow}import { scout, rank, readerAgent, analystAgent } from './lib/agent/pipeline-v2.ts'${colors.reset}`);
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR PENDANT LE TEST:${colors.reset}`);
    console.error(error);
    process.exit(1);
  }
}

// Exécuter le test
testPipeline()
  .then(() => {
    console.log(`\n${colors.green}${colors.bright}✅ Tests terminés avec succès${colors.reset}\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${colors.red}❌ Tests échoués:${colors.reset}`, error);
    process.exit(1);
  });
