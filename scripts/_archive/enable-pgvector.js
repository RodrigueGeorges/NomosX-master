import 'dotenv/config';
import {  PrismaClient  } from '@prisma/client';

const prisma = new PrismaClient();

async function enablePgVector() {
  try {
    console.log('Activating pgvector extension on Neon...');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector activé avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

enablePgVector();
