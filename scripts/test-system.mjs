#!/usr/bin/env node
/**
 * Script de diagnostic complet du système NomosX
 * Vérifie : DB, OpenAI, Agents, Data
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// Couleurs console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function success(msg) {
  console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}

function error(msg) {
  console.log(`${colors.red}✗ ${msg}${colors.reset}`);
}

function info(msg) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

function warn(msg) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

async function main() {
  console.log('\n' + colors.blue + '═══════════════════════════════════════' + colors.reset);
  console.log(colors.blue + '  NomosX System Diagnostic' + colors.reset);
  console.log(colors.blue + '═══════════════════════════════════════\n' + colors.reset);

  let allGood = true;

  // ========== 1. Environment Variables ==========
  console.log(colors.cyan + '1. VARIABLES D\'ENVIRONNEMENT' + colors.reset);
  
  if (process.env.DATABASE_URL) {
    success('DATABASE_URL configurée');
  } else {
    error('DATABASE_URL manquante');
    allGood = false;
  }

  if (process.env.OPENAI_API_KEY) {
    const key = process.env.OPENAI_API_KEY;
    success(`OPENAI_API_KEY configurée (${key.slice(0, 7)}...${key.slice(-4)})`);
  } else {
    error('OPENAI_API_KEY manquante');
    allGood = false;
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  info(`OPENAI_MODEL: ${model}`);

  console.log('');

  // ========== 2. Database Connection ==========
  console.log(colors.cyan + '2. CONNEXION BASE DE DONNÉES' + colors.reset);
  
  try {
    await prisma.$connect();
    success('Connexion PostgreSQL OK');
  } catch (err) {
    error(`Connexion échouée: ${err.message}`);
    allGood = false;
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('');

  // ========== 3. Database Content ==========
  console.log(colors.cyan + '3. CONTENU DE LA BASE DE DONNÉES' + colors.reset);

  const sourceCount = await prisma.source.count();
  const briefCount = await prisma.brief.count();
  const authorCount = await prisma.author.count();
  const institutionCount = await prisma.institution.count();
  
  let domainCount = 0;
  try {
    domainCount = await prisma.domain?.count() || 0;
  } catch (err) {
    // Domain table might not exist yet
    domainCount = 0;
  }

  if (sourceCount > 0) {
    success(`${sourceCount} sources dans la DB`);
  } else {
    warn('Aucune source dans la DB — lancez une ingestion !');
    allGood = false;
  }

  info(`${briefCount} briefs`);
  info(`${authorCount} auteurs`);
  info(`${institutionCount} institutions`);
  info(`${domainCount} domaines`);

  // Check novelty scores for radar
  const highNoveltyCount = await prisma.source.count({
    where: { noveltyScore: { gte: 60 } },
  });

  if (highNoveltyCount > 0) {
    success(`${highNoveltyCount} sources avec novelty ≥ 60 (suffisant pour Radar)`);
  } else {
    warn('Aucune source avec novelty ≥ 60 — Radar ne pourra pas générer de signaux');
  }

  console.log('');

  // ========== 4. OpenAI API Test ==========
  console.log(colors.cyan + '4. TEST API OPENAI' + colors.reset);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    info('Test de completion...');
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: 'Respond with only: OK' }],
      max_tokens: 10,
    });

    const response = completion.choices[0].message.content;
    if (response && response.includes('OK')) {
      success('API OpenAI fonctionne (completion)');
    } else {
      warn(`API répond mais réponse inattendue: ${response}`);
    }

    info('Test d\'embedding...');
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'test',
    });

    if (embedding.data && embedding.data.length > 0) {
      success('API OpenAI fonctionne (embedding)');
    }

  } catch (err) {
    if (err.status === 429) {
      error('Rate limit atteint (429) — Attendez 60 secondes ou upgradez votre tier OpenAI');
      warn('Voir : https://platform.openai.com/settings/organization/limits');
    } else if (err.status === 404) {
      error(`Modèle ${model} introuvable — Vérifiez OPENAI_MODEL dans .env`);
    } else if (err.status === 401) {
      error('Clé API invalide — Vérifiez OPENAI_API_KEY dans .env');
    } else {
      error(`Erreur OpenAI: ${err.message}`);
    }
    allGood = false;
  }

  console.log('');

  // ========== 5. Agent Radar Test ==========
  if (highNoveltyCount > 0 && allGood) {
    console.log(colors.cyan + '5. TEST AGENT RADAR' + colors.reset);
    
    try {
      info('Génération de 2 radar cards...');
      
      // Get sources
      const sources = await prisma.source.findMany({
        where: { noveltyScore: { gte: 60 } },
        take: 10,
        orderBy: [{ noveltyScore: 'desc' }, { createdAt: 'desc' }],
        include: {
          authors: { include: { author: true } },
        },
      });

      const ctx = sources.slice(0, 5).map((s, i) => {
        const authors = s.authors?.map((sa) => sa.author?.name).filter(Boolean).slice(0, 2).join(', ') || '';
        return `[SRC-${i + 1}] ${s.title} (${s.year || 'n/d'})
Authors: ${authors}
Novelty: ${s.noveltyScore} | Quality: ${s.qualityScore}`;
      }).join('\n\n');

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.4,
        messages: [{
          role: 'user',
          content: `Analyze these novel sources and identify 2 "radar cards":
- Each card is a weak signal: an emerging trend, method, or finding
- For each, explain "why it matters"

Return JSON:
{
  "cards": [
    {
      "title": "Signal title",
      "signal": "What we're seeing",
      "why_it_matters": "Strategic implications",
      "sources": ["SRC-1"],
      "confidence": "medium"
    }
  ]
}

Sources:
${ctx}`,
        }],
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(text);
      const cards = parsed.cards || [];

      if (cards.length > 0) {
        success(`Agent RADAR fonctionne ! ${cards.length} signal(aux) généré(s)`);
        info(`Exemple: "${cards[0].title}"`);
      } else {
        warn('Agent RADAR répond mais ne génère pas de cartes');
      }

    } catch (err) {
      if (err.status === 429) {
        error('Rate limit atteint pour test RADAR');
      } else {
        error(`Erreur Agent RADAR: ${err.message}`);
      }
      allGood = false;
    }
  } else {
    console.log(colors.cyan + '5. TEST AGENT RADAR' + colors.reset);
    warn('Skipped — Pas assez de données ou OpenAI non fonctionnel');
  }

  console.log('');

  // ========== Final Report ==========
  console.log(colors.blue + '═══════════════════════════════════════' + colors.reset);
  
  if (allGood && sourceCount > 0) {
    console.log(colors.green + '✅ SYSTÈME OPÉRATIONNEL\n' + colors.reset);
    success('Tous les agents peuvent fonctionner');
    info('Vous pouvez utiliser /radar, /search, /brief, /council');
  } else if (sourceCount === 0) {
    console.log(colors.yellow + '⚠ SYSTÈME CONFIGURÉ MAIS SANS DATA\n' + colors.reset);
    warn('Base de données vide — lancez une ingestion');
    info('Commande: npm run dev puis visitez /dashboard');
    info('Ou utilisez l\'API: POST /api/ingestion/run');
  } else {
    console.log(colors.red + '❌ PROBLÈMES DÉTECTÉS\n' + colors.reset);
    error('Corrigez les erreurs ci-dessus avant d\'utiliser les agents');
  }

  console.log(colors.blue + '═══════════════════════════════════════\n' + colors.reset);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(colors.red + '\n❌ Erreur fatale:' + colors.reset, err);
  process.exit(1);
});
