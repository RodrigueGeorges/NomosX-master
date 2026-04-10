#!/usr/bin/env node
import { PrismaClient } from '../generated/prisma-client/index.js';

const prisma = new PrismaClient();

async function checkSchema() {
  console.log('\n📊 COLONNES RÉELLES DE LA TABLE Source:\n');
  
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'Source'
    ORDER BY ordinal_position
  `;
  
  console.log(`Total: ${columns.length} colonnes\n`);
  
  columns.forEach((col, i) => {
    const institutional = ['documentType', 'issuer', 'issuerType', 'classification', 'publishedDate', 'language', 'contentFormat', 'securityLevel', 'economicSeries', 'legalStatus'].includes(col.column_name);
    const marker = institutional ? '🆕' : '  ';
    console.log(`${marker} ${(i + 1).toString().padStart(2)}. ${col.column_name.padEnd(25)} ${col.data_type.padEnd(30)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
  });
  
  console.log('\n🆕 = Nouveau champ institutionnel\n');
  
  await prisma.$disconnect();
}

checkSchema().catch(console.error);
