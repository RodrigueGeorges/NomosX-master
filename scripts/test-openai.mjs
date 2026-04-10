#!/usr/bin/env node
/**
 * Test script pour vérifier la connexion OpenAI
 * Usage: node scripts/test-openai.mjs
 */

import 'dotenv/config';
import OpenAI from 'openai';

async function testOpenAI() {
  console.log('\n🔍 Test de connexion OpenAI...\n');

  // Vérifier les variables d'environnement
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY manquant dans .env');
    console.log('\n📝 Ajoutez dans votre fichier .env :');
    console.log('OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  console.log('✅ OPENAI_API_KEY trouvé');
  console.log(`✅ OPENAI_MODEL: ${model}`);
  console.log(`   Clé API: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}\n`);

  // Initialiser le client
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  try {
    console.log('🧪 Test 1: Simple completion...');
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: 'Réponds en un seul mot.' },
        { role: 'user', content: 'Dis "OK" si tu me reçois.' }
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const response = completion.choices[0].message.content;
    console.log(`   Réponse: "${response}"`);
    console.log('   ✅ Completion fonctionne\n');

    console.log('🧪 Test 2: Embedding (pour recherche sémantique)...');
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Test embedding',
    });

    const embeddingSize = embedding.data[0].embedding.length;
    console.log(`   Dimension: ${embeddingSize}`);
    console.log('   ✅ Embeddings fonctionnent\n');

    console.log('🎉 OpenAI est correctement configuré !\n');
    console.log('📊 Vous pouvez utiliser :');
    console.log('   - READER Agent (extraction de claims)');
    console.log('   - ANALYST Agent (synthèses stratégiques)');
    console.log('   - DIGEST Agent (veille hebdomadaire)');
    console.log('   - RADAR Agent (signaux faibles)');
    console.log('   - COUNCIL Agent (débats multi-angles)');
    console.log('   - Recherche sémantique (embeddings)\n');

  } catch (error) {
    console.error('\n❌ Erreur lors du test :\n');
    
    if (error.status === 401) {
      console.error('🔑 Clé API invalide');
      console.error('   Vérifiez votre OPENAI_API_KEY dans .env');
      console.error('   Obtenez une clé sur : https://platform.openai.com/api-keys\n');
    } else if (error.status === 429) {
      console.error('⏳ Rate limit atteint');
      console.error('   Attendez quelques secondes ou vérifiez votre quota\n');
    } else if (error.code === 'insufficient_quota') {
      console.error('💳 Quota insuffisant');
      console.error('   Ajoutez des crédits sur : https://platform.openai.com/account/billing\n');
    } else {
      console.error(error.message);
      console.error('\nDétails complets :');
      console.error(error);
    }
    
    process.exit(1);
  }
}

testOpenAI().catch((err) => {
  console.error('Erreur inattendue :', err);
  process.exit(1);
});
