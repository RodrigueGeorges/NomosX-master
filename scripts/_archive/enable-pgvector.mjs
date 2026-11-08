import 'dotenv/config';
import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function enablePgVector() {
  try {
    console.log('Activating pgvector extension on Neon...');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector activé avec succès !');
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

enablePgVector();
