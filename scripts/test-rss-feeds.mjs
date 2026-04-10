#!/usr/bin/env node
/**
 * Test RSS feeds - Alternative au scraping
 */

import Parser from 'rss-parser';

const parser = new Parser();

const FEEDS = {
  odni: 'https://www.dni.gov/index.php?format=feed&type=rss',
  nato: 'https://www.nato.int/cps/en/natohq/news.rss',
  cisa: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  imf: 'https://www.imf.org/en/Publications/rss',
  bis: 'https://www.bis.org/doclist/all.rss',
  enisa: 'https://www.enisa.europa.eu/rss/publications.rss',
};

async function testFeed(name, url) {
  try {
    console.log(`\n[${name.toUpperCase()}] Fetching...`);
    const feed = await parser.parseURL(url);
    console.log(`✅ ${feed.items.length} items`);
    console.log(`   Latest: "${feed.items[0]?.title?.substring(0, 60)}..."`);
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

async function testAllFeeds() {
  console.log('🧪 TEST RSS FEEDS - Alternative au scraping\n');
  console.log('='.repeat(60));
  
  const results = await Promise.all(
    Object.entries(FEEDS).map(([name, url]) => testFeed(name, url))
  );
  
  const successCount = results.filter(Boolean).length;
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ ${successCount}/${results.length} feeds fonctionnels\n`);
  
  if (successCount >= results.length * 0.5) {
    console.log('🎯 RSS feeds = SOLUTION VIABLE pour NomosX');
    console.log('   • Plus stable que scraping HTML');
    console.log('   • Mis à jour automatiquement');
    console.log('   • Pas de risque de ban\n');
  }
}

testAllFeeds().catch(console.error);
