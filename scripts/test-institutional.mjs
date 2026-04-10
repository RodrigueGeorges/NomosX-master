#!/usr/bin/env node
/**
 * Test script pour providers institutionnels
 * Usage: node scripts/test-institutional.mjs
 */

import { searchODNI } from '../lib/providers/institutional/intelligence/odni.js';
import { searchIMF } from '../lib/providers/institutional/economic/imf.js';
import { searchNATO } from '../lib/providers/institutional/defense/nato.js';
import { searchCISA } from '../lib/providers/institutional/cyber/cisa.js';

async function testProviders() {
  console.log('🧪 TEST PROVIDERS INSTITUTIONNELS\n');
  console.log('='.repeat(60));
  
  // Test 1: ODNI (Intelligence)
  console.log('\n🔴 [1/4] Testing ODNI...');
  try {
    const odni = await searchODNI('artificial intelligence threats', 3);
    console.log(`✅ ODNI: Found ${odni.length} sources`);
    if (odni.length > 0) {
      console.log(`   Sample: "${odni[0].title.substring(0, 60)}..."`);
    }
  } catch (error) {
    console.log(`❌ ODNI: ${error.message}`);
  }
  
  // Test 2: IMF (Economic)
  console.log('\n🟡 [2/4] Testing IMF...');
  try {
    const imf = await searchIMF('inflation policy', 3);
    console.log(`✅ IMF: Found ${imf.length} sources`);
    if (imf.length > 0) {
      console.log(`   Sample: "${imf[0].title.substring(0, 60)}..."`);
    }
  } catch (error) {
    console.log(`❌ IMF: ${error.message}`);
  }
  
  // Test 3: NATO (Defense)
  console.log('\n🟠 [3/4] Testing NATO...');
  try {
    const nato = await searchNATO('cyber defense', 3);
    console.log(`✅ NATO: Found ${nato.length} sources`);
    if (nato.length > 0) {
      console.log(`   Sample: "${nato[0].title.substring(0, 60)}..."`);
    }
  } catch (error) {
    console.log(`❌ NATO: ${error.message}`);
  }
  
  // Test 4: CISA (Cyber)
  console.log('\n🟢 [4/4] Testing CISA...');
  try {
    const cisa = await searchCISA('critical infrastructure', 3);
    console.log(`✅ CISA: Found ${cisa.length} sources`);
    if (cisa.length > 0) {
      console.log(`   Sample: "${cisa[0].title.substring(0, 60)}..."`);
    }
  } catch (error) {
    console.log(`❌ CISA: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test completed!\n');
}

testProviders().catch(console.error);
