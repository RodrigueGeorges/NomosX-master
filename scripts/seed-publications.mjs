import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PUBLICATIONS = [
  {
    id: 'pub-1',
    verticalId: 'tech',
    type: 'SUMMARY_BRIEF',
    title: 'AI Regulation: Global Trends Overview',
    html: `<h1>AI Regulation: Global Trends Overview</h1>
    <p>Our analysis of AI regulatory frameworks across 47 jurisdictions reveals emerging patterns that will shape corporate strategy through 2025.</p>
    <h2>Key Findings</h2>
    <ul>
      <li>EU AI Act establishes risk-based classification system</li>
      <li>US adopts sector-specific approach with FTC oversight</li>
      <li>China focuses on state control and data sovereignty</li>
    </ul>
    <p>Companies must prepare for compliance costs averaging 2.3% of AI development budgets.</p>`,
    wordCount: 450,
    trustScore: 92,
    qualityScore: 88,
    citationCoverage: 0.85,
    claimCount: 3,
    factClaimCount: 2,
    citedClaimCount: 2,
    sourceIds: ['demo-1', 'demo-2'],
    status: 'PUBLISHED',
    publishedAt: new Date('2024-01-15'),
    publicId: 'ai-regulation-summary-2024',
  },
  {
    id: 'pub-2',
    verticalId: 'tech',
    type: 'EXECUTIVE_BRIEF',
    title: 'AI Regulation: Global Trends and Strategic Implications',
    html: `<h1>AI Regulation: Global Trends and Strategic Implications</h1>
    <p>Our comprehensive analysis of AI regulatory frameworks across 47 jurisdictions reveals emerging patterns that will shape corporate strategy through 2025.</p>
    <h2>Executive Summary</h2>
    <p>The global AI regulatory landscape is rapidly evolving, with significant implications for corporate strategy and investment decisions. Our analysis of 47 jurisdictions identifies three dominant regulatory approaches.</p>
    <h2>Key Findings</h2>
    <ul>
      <li>EU AI Act establishes risk-based classification system with compliance costs averaging 2.3%</li>
      <li>US adopts sector-specific approach with FTC oversight and voluntary guidelines</li>
      <li>China focuses on state control and data sovereignty requirements</li>
      <li>Global convergence expected by 2026 with common principles emerging</li>
    </ul>
    <h2>Strategic Recommendations</h2>
    <ol>
      <li>Establish cross-functional AI governance committees</li>
      <li>Implement risk assessment frameworks aligned with EU standards</li>
      <li>Develop compliance monitoring systems</li>
      <li>Allocate budget for regulatory compliance (2-3% of AI spend)</li>
    </ol>`,
    wordCount: 850,
    trustScore: 94,
    qualityScore: 91,
    citationCoverage: 0.92,
    claimCount: 5,
    factClaimCount: 3,
    citedClaimCount: 4,
    sourceIds: ['demo-1', 'demo-2', 'demo-3'],
    status: 'PUBLISHED',
    publishedAt: new Date('2024-01-15'),
    publicId: 'ai-regulation-executive-2024',
  },
  {
    id: 'pub-3',
    verticalId: 'climate',
    type: 'STRATEGIC_REPORT',
    title: 'Carbon Pricing Mechanisms: Market Evolution and Corporate Strategy',
    html: `<h1>Carbon Pricing Mechanisms: Market Evolution and Corporate Strategy</h1>
    <p>Analysis of 87 carbon pricing initiatives shows market maturation with implications for corporate planning and investment decisions through 2030.</p>
    <h2>Executive Summary</h2>
    <p>Global carbon pricing coverage reached 23% of emissions in 2023, with prices ranging from $5 to $130 per tonne CO2e. Market evolution suggests significant opportunities for strategic positioning.</p>
    <h2>Market Analysis</h2>
    <h3>Current Landscape</h3>
    <ul>
      <li>73 jurisdictions have carbon pricing mechanisms</li>
      <li>Global coverage: 23% of GHG emissions</li>
      <li>Price range: $5-130 per tonne CO2e</li>
      <li>Market value: $95 billion annually</li>
    </ul>
    <h3>Regional Analysis</h3>
    <h4>European Union</h4>
    <p>ETS covers 45% of EU emissions, average price €85/tonne. Phase 4 (2021-2030) aims for 43% reduction vs 2005 levels.</p>
    <h4>North America</h4>
    <p>Fragmented approach with federal, state, and provincial systems. California cap-and-trade leads with $35/tonne average price.</p>
    <h4>Asia-Pacific</h4>
    <p>China's national ETS covers 40% of emissions, price $7/tonne. Japan and Korea have mature systems with $20-30/tonne prices.</p>
    <h2>Strategic Implications</h2>
    <h3>Investment Decisions</h3>
    <ul>
      <li>Internal carbon pricing for investment evaluation</li>
      <li>Supply chain decarbonization programs</li>
      <li>Carbon offset quality verification</li>
      <li>Green technology acceleration</li>
    </ul>
    <h3>Risk Management</h3>
    <ul>
      <li>Price volatility hedging strategies</li>
      <li>Regulatory compliance monitoring</li>
      <li>Reputational risk assessment</li>
      <li>Competitive positioning analysis</li>
    </ul>
    <h2>Market Forecast</h2>
    <h3>2025-2030 Projections</h3>
    <ul>
      <li>Global coverage to reach 60% of emissions</li>
      <li>Average price to increase to $80-100/tonne</li>
      <li>Market value to exceed $500 billion</li>
      <li>Linkage between regional systems</li>
    </ul>
    <h2>Recommendations</h2>
    <h3>Immediate Actions (2024)</h3>
    <ol>
      <li>Implement internal carbon pricing ($50-75/tonne)</li>
      <li>Establish carbon accounting systems</li>
      <li>Conduct supply chain emissions assessment</li>
      <li>Develop carbon reduction roadmap</li>
    </ol>
    <h3>Medium-term Strategy (2025-2027)</h3>
    <ol>
      <li>Invest in low-carbon technologies</li>
      <li>Develop carbon offset portfolio</li>
      <li>Engage in policy advocacy</li>
      <li>Explore carbon capture opportunities</li>
    </ol>
    <h3>Long-term Positioning (2028-2030)</h3>
    <ol>
      <li>Achieve carbon neutrality in operations</li>
      <li>Develop carbon-negative business models</li>
      <li>Lead industry decarbonization initiatives</li>
      <li>Monetize carbon credits</li>
    </ol>`,
    wordCount: 2500,
    trustScore: 96,
    qualityScore: 94,
    citationCoverage: 0.95,
    claimCount: 12,
    factClaimCount: 8,
    citedClaimCount: 10,
    sourceIds: ['demo-4', 'demo-5', 'demo-6', 'demo-7'],
    status: 'PUBLISHED',
    publishedAt: new Date('2024-01-10'),
    publicId: 'carbon-pricing-strategic-2024',
  }
];

async function main() {
  console.log('📄 Seeding publications...\n');

  // Check if publications already exist
  const existingCount = await prisma.thinkTankPublication.count({
    where: { id: { startsWith: 'pub-' } },
  });

  if (existingCount > 0) {
    console.log(`✅ Publications already exist (${existingCount} found)`);
    return;
  }

  // Create verticals if they don't exist
  const verticals = [
    { id: 'tech', name: 'Technology', slug: 'tech', config: {} },
    { id: 'climate', name: 'Climate & Environment', slug: 'climate', config: {} },
    { id: 'healthcare', name: 'Healthcare', slug: 'healthcare', config: {} },
  ];

  for (const vertical of verticals) {
    await prisma.vertical.upsert({
      where: { id: vertical.id },
      update: {},
      create: vertical,
    });
  }

  // Create publications
  for (const pub of DEMO_PUBLICATIONS) {
    await prisma.thinkTankPublication.create({
      data: pub,
    });
  }

  console.log(`✅ ${DEMO_PUBLICATIONS.length} publications created successfully!`);
  console.log('\n🎯 Next steps:');
  console.log('1. Visit http://localhost:3000/api/public/briefs');
  console.log('2. Visit http://localhost:3000/dashboard');
  console.log('3. Test the 3-tier flows');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
