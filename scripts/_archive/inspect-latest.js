require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const latest = await prisma.brief.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      question: true,
      html: true,
      trustScore: true,
      createdAt: true,
      lineage: true,
      sources: true,
    },
  });

  if (!latest) {
    console.log('No briefs found in database');
    return;
  }

  console.log('=== LATEST BRIEF ===');
  console.log('ID:', latest.id);
  console.log('Kind:', latest.kind);
  console.log('Question:', latest.question);
  console.log('Trust Score:', latest.trustScore);
  console.log('Created:', latest.createdAt);
  console.log('Sources count:', Array.isArray(latest.sources) ? latest.sources.length : 'N/A');
  console.log('HTML length:', latest.html?.length || 0);

  // Save HTML for inspection
  fs.writeFileSync('scripts/latest-publication.html', latest.html || '');
  console.log('\nHTML saved to scripts/latest-publication.html');

  // Save lineage for inspection
  if (latest.lineage) {
    fs.writeFileSync('scripts/latest-lineage.json', JSON.stringify(latest.lineage, null, 2));
    console.log('Lineage saved to scripts/latest-lineage.json');
    
    // Extract key stats from lineage
    const lin = latest.lineage;
    console.log('\n=== LINEAGE STATS ===');
    console.log('Steps:', lin.steps?.length || 'N/A');
    console.log('Trust score:', lin.criticalLoop?.finalScore || 'N/A');
    console.log('Hero image:', JSON.stringify(lin.heroImage));
    console.log('Predictions:', JSON.stringify(lin.predictions));
    
    // Check for causal chain in the analysis
    if (lin.frictionMap || lin.stressTestMap) {
      console.log('\n=== FRICTION MAP ===');
      console.log('Mechanisms:', lin.frictionMap?.mechanisms?.length || 0);
      console.log('Collisions:', lin.frictionMap?.collisions?.length || 0);
      console.log('\n=== STRESS TEST ===');
      console.log('Surviving mechanisms:', lin.stressTestMap?.survivingMechanisms?.length || 0);
      console.log('Mechanism assessments:', lin.stressTestMap?.mechanismAssessments?.length || 0);
    }
  }

  // Extract text content from HTML (strip tags)
  const text = (latest.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  fs.writeFileSync('scripts/latest-text.txt', text);
  console.log('\nText content saved to scripts/latest-text.txt');
  console.log('Text length:', text.length);
  
  // Show first 2000 chars of text
  console.log('\n=== FIRST 2000 CHARS OF TEXT ===');
  console.log(text.slice(0, 2000));
  
  // Count [SRC-N] citations
  const citations = text.match(/\[SRC-(\d+)\]/g) || [];
  const uniqueCitations = [...new Set(citations)];
  console.log('\n=== CITATIONS ===');
  console.log('Total [SRC-N] mentions:', citations.length);
  console.log('Unique sources cited:', uniqueCitations.length);
  console.log('Cited:', uniqueCitations.sort((a, b) => {
    const na = parseInt(a.match(/\d+/)[0]);
    const nb = parseInt(b.match(/\d+/)[0]);
    return na - nb;
  }).join(', '));
  
  // Look for causal chain keywords
  const chainKeywords = text.match(/(threshold|discontinuity|vacuum|ceiling|mechanism|trajectory|inflection|tipping point|bifurcation|cascade|chain)/gi) || [];
  console.log('\n=== CAUSAL CHAIN KEYWORDS ===');
  console.log('Count:', chainKeywords.length);
  console.log('Keywords:', [...new Set(chainKeywords.map(k => k.toLowerCase()))].join(', '));
  
  // Look for hedging language
  const hedgeWords = text.match(/\b(may|could|might|suggests|appears|tends to|on the other hand|both|perhaps|arguably|seemingly|ostensibly|presumably|likely|possibly|potentially)\b/gi) || [];
  console.log('\n=== HEDGING LANGUAGE ===');
  console.log('Count:', hedgeWords.length);
  console.log('Words:', hedgeWords.slice(0, 20).join(', '));
  
  // Look for numbers/quantification
  const numbers = text.match(/\b\d+[\.,]?\d*\s?(?:%|billion|million|trillion|Md|M\$|B\$|bn|mn|euros?|\$|€|GBP|£)\b/gi) || [];
  console.log('\n=== QUANTIFICATION ===');
  console.log('Numbers found:', numbers.length);
  console.log('Numbers:', numbers.slice(0, 15).join(', '));
  
  // Look for probability language
  const probWords = text.match(/\b(almost certain|extremely likely|very likely|likely|about as likely as not|unlikely|very unlikely|extremely unlikely|probability|confidence|P\(T\)|interval)\b/gi) || [];
  console.log('\n=== PROBABILITY LANGUAGE ===');
  console.log('Count:', probWords.length);
  console.log('Words:', probWords.slice(0, 10).join(', '));
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
