#!/usr/bin/env node
/**
 * Script pour créer des données de démo rapides
 * Utile pour tester l'application sans attendre l'API externe
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_SOURCES = [
  {
    id: 'demo-1',
    title: 'Carbon Pricing and Emission Reduction in the EU',
    abstract: 'This study examines the effectiveness of carbon pricing mechanisms in reducing greenhouse gas emissions across European Union member states. Our analysis shows a 15-20% reduction in emissions in countries with robust carbon pricing.',
    year: 2024,
    qualityScore: 85,
    noveltyScore: 72,
    provider: 'openalex',
    raw: {},
  },
  {
    id: 'demo-2',
    title: 'Quantum Computing Applications in Drug Discovery',
    abstract: 'We present a novel quantum algorithm for molecular simulation that reduces computation time by 10x compared to classical methods. This breakthrough could accelerate drug discovery pipelines significantly.',
    year: 2024,
    qualityScore: 92,
    noveltyScore: 88,
    provider: 'arxiv',
    raw: {},
  },
  {
    id: 'demo-3',
    title: 'AI-Driven Climate Modeling: A New Paradigm',
    abstract: 'Machine learning models trained on satellite data achieve 95% accuracy in predicting regional climate patterns 6 months in advance. This represents a significant improvement over traditional physics-based models.',
    year: 2024,
    qualityScore: 88,
    noveltyScore: 81,
    provider: 'crossref',
    raw: {},
  },
  {
    id: 'demo-4',
    title: 'Blockchain for Supply Chain Transparency in Food Systems',
    abstract: 'Implementation of blockchain technology in food supply chains increases transparency and reduces food fraud by 40%. Case studies from three continents demonstrate scalability.',
    year: 2023,
    qualityScore: 75,
    noveltyScore: 65,
    provider: 'openalex',
    raw: {},
  },
  {
    id: 'demo-5',
    title: 'Neural Interfaces for Prosthetic Control: A Clinical Trial',
    abstract: 'Our brain-computer interface allows amputees to control prosthetic limbs with 98% accuracy using only neural signals. 25 patients showed significant improvement in quality of life metrics.',
    year: 2024,
    qualityScore: 90,
    noveltyScore: 85,
    provider: 'pubmed',
    raw: {},
  },
  {
    id: 'demo-6',
    title: 'Microplastic Degradation Using Engineered Bacteria',
    abstract: 'We engineered a bacterial strain capable of breaking down polyethylene microplastics in marine environments. Laboratory tests show 70% degradation within 6 months.',
    year: 2024,
    qualityScore: 86,
    noveltyScore: 78,
    provider: 'openalex',
    raw: {},
  },
  {
    id: 'demo-7',
    title: 'Federated Learning for Healthcare Data Privacy',
    abstract: 'Our federated learning framework enables hospitals to collaboratively train AI models without sharing patient data. Results match centralized training with 95% of the accuracy.',
    year: 2023,
    qualityScore: 83,
    noveltyScore: 70,
    provider: 'arxiv',
    raw: {},
  },
  {
    id: 'demo-8',
    title: 'Urban Heat Island Mitigation Through Green Roofs',
    abstract: 'Large-scale deployment of green roofs in Tokyo reduced urban temperatures by 2-3°C during summer months. Cost-benefit analysis shows positive ROI within 8 years.',
    year: 2023,
    qualityScore: 78,
    noveltyScore: 62,
    provider: 'crossref',
    raw: {},
  },
  {
    id: 'demo-9',
    title: 'CRISPR-Based Diagnostics for Infectious Diseases',
    abstract: 'Portable CRISPR diagnostic devices detect COVID-19, influenza, and malaria with 99% specificity in under 30 minutes. Field trials in rural Africa show promising results.',
    year: 2024,
    qualityScore: 94,
    noveltyScore: 89,
    provider: 'pubmed',
    raw: {},
  },
  {
    id: 'demo-10',
    title: 'Explainable AI in Financial Risk Assessment',
    abstract: 'We developed an explainable neural network for credit risk that outperforms traditional models while providing human-readable explanations. Adopted by 3 major European banks.',
    year: 2023,
    qualityScore: 81,
    noveltyScore: 68,
    provider: 'openalex',
    raw: {},
  },
];

const DEMO_AUTHORS = [
  { name: 'Dr. Emma Chen', orcid: '0000-0001-2345-6789', normalizedName: 'emma chen' },
  { name: 'Prof. Michael Schmidt', orcid: '0000-0002-3456-7890', normalizedName: 'michael schmidt' },
  { name: 'Dr. Sarah Johnson', orcid: '0000-0003-4567-8901', normalizedName: 'sarah johnson' },
  { name: 'Prof. David Lee', orcid: '0000-0004-5678-9012', normalizedName: 'david lee' },
  { name: 'Dr. Anna Kowalski', orcid: '0000-0005-6789-0123', normalizedName: 'anna kowalski' },
];

const DEMO_INSTITUTIONS = [
  { name: 'MIT', rorId: 'https://ror.org/042nb2s44', normalizedName: 'mit' },
  { name: 'Stanford University', rorId: 'https://ror.org/00f54p054', normalizedName: 'stanford university' },
  { name: 'Max Planck Institute', rorId: 'https://ror.org/01hhn8329', normalizedName: 'max planck institute' },
  { name: 'University of Tokyo', rorId: 'https://ror.org/057zh3y96', normalizedName: 'university of tokyo' },
  { name: 'ETH Zurich', rorId: 'https://ror.org/05a28rw58', normalizedName: 'eth zurich' },
];

async function main() {
  console.log('🌱 Seeding demo data...\n');

  // Check if demo data already exists
  const existingCount = await prisma.source.count({
    where: { id: { startsWith: 'demo-' } },
  });

  if (existingCount > 0) {
    console.log(`⚠️  ${existingCount} demo sources already exist.`);
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question('Delete and recreate? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }

    console.log('Deleting existing demo data...');
    await prisma.source.deleteMany({
      where: { id: { startsWith: 'demo-' } },
    });
  }

  // Create authors
  console.log('Creating authors...');
  const authors = [];
  for (const author of DEMO_AUTHORS) {
    const created = await prisma.author.upsert({
      where: { orcid: author.orcid },
      update: {},
      create: author,
    });
    authors.push(created);
  }
  console.log(`✓ ${authors.length} authors created`);

  // Create institutions
  console.log('Creating institutions...');
  const institutions = [];
  for (const inst of DEMO_INSTITUTIONS) {
    const created = await prisma.institution.upsert({
      where: { rorId: inst.rorId },
      update: {},
      create: inst,
    });
    institutions.push(created);
  }
  console.log(`✓ ${institutions.length} institutions created`);

  // Create sources
  console.log('Creating sources...');
  for (let i = 0; i < DEMO_SOURCES.length; i++) {
    const source = DEMO_SOURCES[i];
    
    await prisma.source.create({
      data: {
        ...source,
        authors: {
          create: [
            {
              authorId: authors[i % authors.length].id,
              position: 0,
            },
            {
              authorId: authors[(i + 1) % authors.length].id,
              position: 1,
            },
          ],
        },
        institutions: {
          create: [
            {
              institutionId: institutions[i % institutions.length].id,
            },
          ],
        },
      },
    });
    
    console.log(`  ✓ ${source.title.slice(0, 50)}...`);
  }

  console.log(`\n✅ Demo data created successfully!`);
  console.log(`\nStats:`);
  console.log(`  - ${DEMO_SOURCES.length} sources`);
  console.log(`  - ${authors.length} authors`);
  console.log(`  - ${institutions.length} institutions`);
  
  const highNovelty = DEMO_SOURCES.filter((s) => s.noveltyScore >= 60).length;
  console.log(`  - ${highNovelty} sources with novelty ≥ 60 (for Radar)`);

  console.log(`\n🎯 Next steps:`);
  console.log(`  1. Start the dev server: npm run dev`);
  console.log(`  2. Visit http://localhost:3000/dashboard`);
  console.log(`  3. Try /radar, /search, /brief`);
  console.log(`\n✨ All agents should now work with demo data!`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
