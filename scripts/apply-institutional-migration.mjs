#!/usr/bin/env node
/**
 * Apply institutional fields migration directly to database
 */

import { PrismaClient } from '../generated/prisma-client/index.js';

const prisma = new PrismaClient();

async function applyMigration() {
  console.log('🔄 Applying institutional fields migration...\n');
  
  try {
    // Add columns
    console.log('1️⃣ Adding new columns to Source table...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Source" 
      ADD COLUMN IF NOT EXISTS "documentType" TEXT,
      ADD COLUMN IF NOT EXISTS "issuer" TEXT,
      ADD COLUMN IF NOT EXISTS "issuerType" TEXT,
      ADD COLUMN IF NOT EXISTS "classification" TEXT,
      ADD COLUMN IF NOT EXISTS "publishedDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS "contentFormat" TEXT,
      ADD COLUMN IF NOT EXISTS "securityLevel" TEXT,
      ADD COLUMN IF NOT EXISTS "economicSeries" TEXT,
      ADD COLUMN IF NOT EXISTS "legalStatus" TEXT
    `);
    console.log('   ✅ Columns added\n');
    
    // Add indexes
    console.log('2️⃣ Creating indexes...');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_issuerType_idx" ON "Source"("issuerType")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_issuer_idx" ON "Source"("issuer")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_documentType_idx" ON "Source"("documentType")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_classification_idx" ON "Source"("classification")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_publishedDate_idx" ON "Source"("publishedDate")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Source_language_idx" ON "Source"("language")');
    console.log('   ✅ Indexes created\n');
    
    // Verify
    console.log('3️⃣ Verifying...');
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Source' 
      AND column_name IN ('documentType', 'issuer', 'issuerType', 'classification', 'publishedDate', 'language', 'contentFormat', 'securityLevel', 'economicSeries', 'legalStatus')
      ORDER BY column_name
    `;
    console.log(`   ✅ Found ${result.length}/10 new columns\n`);
    
    if (result.length === 10) {
      console.log('✅ Migration completed successfully!\n');
      console.log('📊 New institutional fields:');
      result.forEach(col => {
        console.log(`   • ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('⚠️  Some columns may be missing. Check manually.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration().catch(console.error);
