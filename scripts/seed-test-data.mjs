import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestData() {
  console.log('🌱 Seeding test data...');

  try {
    // Create verticals
    const techVertical = await prisma.vertical.upsert({
      where: { slug: 'tech' },
      update: {},
      create: {
        slug: 'tech',
        name: 'Technology & AI',
        nameEn: 'Technology & AI',
        description: 'Artificial intelligence, machine learning, and technology policy',
        icon: 'Brain',
        color: '#8B5CF6',
        config: {
          allowedProviders: ['openalex', 'arxiv'],
          trustThreshold: 70,
          noveltyThreshold: 60,
          allowedPublicationTypes: ['EXECUTIVE_BRIEF', 'STRATEGIC_REPORT']
        },
        isActive: true
      }
    });

    const climateVertical = await prisma.vertical.upsert({
      where: { slug: 'climate' },
      update: {},
      create: {
        slug: 'climate',
        name: 'Climate & Environment',
        nameEn: 'Climate & Environment',
        description: 'Climate change, environmental policy, and sustainability',
        icon: 'Leaf',
        color: '#10B981',
        config: {
          allowedProviders: ['openalex', 'nature'],
          trustThreshold: 75,
          noveltyThreshold: 65,
          allowedPublicationTypes: ['EXECUTIVE_BRIEF', 'STRATEGIC_REPORT']
        },
        isActive: true
      }
    });

    console.log('✅ Verticals created/updated');

    // Create publications
    const publications = [
      {
        id: 'pub-1',
        type: 'EXECUTIVE_BRIEF',
        title: 'AI Regulation: Global Trends Overview',
        html: `<h1>AI Regulation: Global Trends Overview</h1>
        <p>Our analysis of global AI regulatory frameworks reveals significant convergence toward risk-based approaches, with the EU AI Act leading in comprehensive oversight while the US adopts a sector-specific strategy.</p>
        <p>Key findings include increased focus on transparency requirements, mandatory impact assessments for high-risk systems, and establishment of dedicated regulatory bodies across major economies.</p>`,
        wordCount: 2500,
        trustScore: 85,
        qualityScore: 90,
        citationCoverage: 0.8,
        claimCount: 12,
        factClaimCount: 8,
        sourceIds: ['source-1', 'source-2', 'source-3'],
        publicId: 'ai-regulation-trends-2024',
        status: 'PUBLISHED',
        publishedAt: new Date('2024-01-15T10:00:00Z'),
        viewCount: 145,
        verticalId: techVertical.id
      },
      {
        id: 'pub-2',
        type: 'STRATEGIC_REPORT',
        title: 'Carbon Pricing Mechanisms: Market Analysis',
        html: `<h1>Carbon Pricing Mechanisms: Market Analysis</h1>
        <p>Comprehensive analysis of global carbon pricing mechanisms shows steady growth in carbon market coverage, with emissions trading systems expanding to new jurisdictions and carbon taxes gaining political acceptance.</p>
        <p>The report identifies key success factors including price stability mechanisms, border carbon adjustments, and integration with broader climate policy frameworks.</p>`,
        wordCount: 4200,
        trustScore: 88,
        qualityScore: 92,
        citationCoverage: 0.85,
        claimCount: 18,
        factClaimCount: 14,
        sourceIds: ['source-4', 'source-5', 'source-6', 'source-7'],
        publicId: 'carbon-pricing-markets-2024',
        status: 'PUBLISHED',
        publishedAt: new Date('2024-01-10T14:30:00Z'),
        viewCount: 203,
        verticalId: climateVertical.id
      },
      {
        id: 'pub-3',
        type: 'EXECUTIVE_BRIEF',
        title: 'Machine Learning in Healthcare: Policy Implications',
        html: `<h1>Machine Learning in Healthcare: Policy Implications</h1>
        <p>Analysis of ML applications in healthcare reveals significant potential for diagnostic accuracy improvement, while raising important policy questions about regulatory oversight, liability frameworks, and equitable access.</p>
        <p>Recommendations include adaptive regulatory pathways, standardized validation protocols, and increased investment in digital health infrastructure.</p>`,
        wordCount: 2800,
        trustScore: 82,
        qualityScore: 87,
        citationCoverage: 0.78,
        claimCount: 15,
        factClaimCount: 11,
        sourceIds: ['source-8', 'source-9', 'source-10'],
        publicId: 'ml-healthcare-policy-2024',
        status: 'PUBLISHED',
        publishedAt: new Date('2024-01-08T09:15:00Z'),
        viewCount: 167,
        verticalId: techVertical.id
      }
    ];

    for (const pubData of publications) {
      await prisma.thinkTankPublication.upsert({
        where: { id: pubData.id },
        update: pubData,
        create: {
          ...pubData,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }

    console.log('✅ Publications created/updated');
    console.log('🎉 Test data seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
