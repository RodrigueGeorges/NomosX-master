#!/usr/bin/env node
/**
 * Apply publication reactions & comments migration directly to database.
 * Creates PublicationReaction and PublicationComment tables.
 *
 * Usage: node scripts/apply-reactions-migration.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyMigration() {
  console.log('Applying publication reactions & comments migration...\n');

  try {
    // 1. PublicationReaction table
    console.log('1. Creating PublicationReaction table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PublicationReaction" (
          "id"            TEXT NOT NULL,
          "userId"        TEXT NOT NULL,
          "publicationId" TEXT NOT NULL,
          "type"          TEXT NOT NULL,
          "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PublicationReaction_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   Table created');

    // Unique constraint
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PublicationReaction_userId_publicationId_key"
          ON "PublicationReaction"("userId", "publicationId")
    `);
    console.log('   Unique index created');

    // Indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PublicationReaction_publicationId_type_idx"
          ON "PublicationReaction"("publicationId", "type")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PublicationReaction_userId_idx"
          ON "PublicationReaction"("userId")
    `);
    console.log('   Indexes created');

    // Foreign keys (use IF NOT EXISTS equivalent via DO block)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublicationReaction"
          ADD CONSTRAINT "PublicationReaction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublicationReaction"
          ADD CONSTRAINT "PublicationReaction_publicationId_fkey"
          FOREIGN KEY ("publicationId") REFERENCES "ThinkTankPublication"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    console.log('   Foreign keys created\n');

    // 2. PublicationComment table
    console.log('2. Creating PublicationComment table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PublicationComment" (
          "id"            TEXT NOT NULL,
          "userId"        TEXT NOT NULL,
          "publicationId" TEXT NOT NULL,
          "content"       TEXT NOT NULL,
          "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"     TIMESTAMP(3) NOT NULL,
          CONSTRAINT "PublicationComment_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   Table created');

    // Indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PublicationComment_publicationId_createdAt_idx"
          ON "PublicationComment"("publicationId", "createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PublicationComment_userId_idx"
          ON "PublicationComment"("userId")
    `);
    console.log('   Indexes created');

    // Foreign keys
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublicationComment"
          ADD CONSTRAINT "PublicationComment_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublicationComment"
          ADD CONSTRAINT "PublicationComment_publicationId_fkey"
          FOREIGN KEY ("publicationId") REFERENCES "ThinkTankPublication"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    console.log('   Foreign keys created\n');

    console.log('Migration applied successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
