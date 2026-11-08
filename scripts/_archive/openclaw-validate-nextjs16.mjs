/**
 * OpenClaw Next.js 16 Configuration Validator
 * Professional validation of Next.js 16 + Netlify compatibility
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 OpenClaw Next.js 16 Validator\n');
console.log('='.repeat(60));

const results = {
  critical: [],
  warnings: [],
  passed: []
};

// ===== VALIDATION 1: next.config.mjs =====
console.log('\n📋 Validating next.config.mjs...\n');

const configPath = path.join(process.cwd(), 'next.config.mjs');

if (!fs.existsSync(configPath)) {
  results.critical.push('❌ next.config.mjs not found');
} else {
  results.passed.push('✅ next.config.mjs exists');
  
  const configContent = fs.readFileSync(configPath, 'utf-8');
  
  // Check ES module syntax
  if (configContent.includes('export default')) {
    results.passed.push('✅ Uses ES module syntax (export default)');
  } else if (configContent.includes('module.exports')) {
    results.critical.push('❌ Uses CommonJS (module.exports) - must use ES module');
  }
  
  // Check for obsolete keys
  if (configContent.includes('turbopack:')) {
    if (configContent.match(/turbopack:\s*(false|true)/)) {
      results.critical.push('❌ turbopack boolean found - Next.js 16 expects object or omit');
    } else {
      results.warnings.push('⚠️  turbopack config present - verify it\'s an object');
    }
  } else {
    results.passed.push('✅ No turbopack boolean (good for webpack mode)');
  }
  
  if (configContent.includes('swcMinify')) {
    results.warnings.push('⚠️  swcMinify found - unrecognized in Next.js 16');
  } else {
    results.passed.push('✅ No swcMinify key');
  }
  
  if (configContent.includes('experimental.serverComponentsExternalPackages')) {
    results.critical.push('❌ experimental.serverComponentsExternalPackages found - moved to serverExternalPackages');
  } else {
    results.passed.push('✅ No experimental.serverComponentsExternalPackages');
  }
  
  if (configContent.includes('serverExternalPackages')) {
    results.passed.push('✅ serverExternalPackages at root level');
  }
  
  if (configContent.includes('webpack:')) {
    results.passed.push('✅ Custom webpack config present');
  }
}

// ===== VALIDATION 2: package.json =====
console.log('\n📦 Validating package.json...\n');

const packagePath = path.join(process.cwd(), 'package.json');

if (!fs.existsSync(packagePath)) {
  results.critical.push('❌ package.json not found');
} else {
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  
  // Check build script
  const buildScript = packageContent.scripts?.build;
  
  if (!buildScript) {
    results.critical.push('❌ No build script found');
  } else if (buildScript.includes('--webpack')) {
    results.passed.push('✅ Build script uses --webpack flag');
  } else if (buildScript.includes('--turbopack')) {
    results.warnings.push('⚠️  Build script uses --turbopack (may conflict with webpack config)');
  } else {
    results.warnings.push('⚠️  Build script has no explicit --webpack or --turbopack flag');
  }
  
  // Check Node version
  if (packageContent.engines?.node) {
    const nodeVersion = packageContent.engines.node;
    if (nodeVersion.includes('20.9') || nodeVersion.includes('>=20.9')) {
      results.passed.push(`✅ Node.js version specified: ${nodeVersion}`);
    } else {
      results.warnings.push(`⚠️  Node.js version: ${nodeVersion} (Next.js requires >=20.9.0)`);
    }
  }
}

// ===== VALIDATION 3: .nvmrc =====
console.log('\n🔧 Validating .nvmrc...\n');

const nvmrcPath = path.join(process.cwd(), '.nvmrc');

if (!fs.existsSync(nvmrcPath)) {
  results.warnings.push('⚠️  .nvmrc not found (recommended for Netlify)');
} else {
  const nvmrcContent = fs.readFileSync(nvmrcPath, 'utf-8').trim();
  const version = parseFloat(nvmrcContent);
  
  if (version >= 20.9) {
    results.passed.push(`✅ .nvmrc specifies Node ${nvmrcContent}`);
  } else {
    results.critical.push(`❌ .nvmrc specifies Node ${nvmrcContent} (need >=20.9.0)`);
  }
}

// ===== VALIDATION 4: netlify.toml =====
console.log('\n🌐 Validating netlify.toml...\n');

const netlifyPath = path.join(process.cwd(), 'netlify.toml');

if (!fs.existsSync(netlifyPath)) {
  results.warnings.push('⚠️  netlify.toml not found');
} else {
  const netlifyContent = fs.readFileSync(netlifyPath, 'utf-8');
  
  if (netlifyContent.includes('NODE_VERSION')) {
    const nodeMatch = netlifyContent.match(/NODE_VERSION\s*=\s*["']([^"']+)["']/);
    if (nodeMatch) {
      const version = parseFloat(nodeMatch[1]);
      if (version >= 20.9) {
        results.passed.push(`✅ netlify.toml NODE_VERSION: ${nodeMatch[1]}`);
      } else {
        results.critical.push(`❌ netlify.toml NODE_VERSION: ${nodeMatch[1]} (need >=20.9.0)`);
      }
    }
  }
}

// ===== FINAL REPORT =====
console.log('\n' + '='.repeat(60));
console.log('\n📊 VALIDATION REPORT\n');

if (results.critical.length > 0) {
  console.log('🚨 CRITICAL ISSUES:\n');
  results.critical.forEach(issue => console.log(`   ${issue}`));
}

if (results.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:\n');
  results.warnings.forEach(warning => console.log(`   ${warning}`));
}

if (results.passed.length > 0) {
  console.log('\n✅ PASSED CHECKS:\n');
  results.passed.forEach(pass => console.log(`   ${pass}`));
}

console.log('\n' + '='.repeat(60));

// ===== VERDICT =====
const criticalCount = results.critical.length;
const warningCount = results.warnings.length;
const passedCount = results.passed.length;

console.log('\n📈 SUMMARY:\n');
console.log(`   ✅ Passed: ${passedCount}`);
console.log(`   ⚠️  Warnings: ${warningCount}`);
console.log(`   🚨 Critical: ${criticalCount}`);

if (criticalCount === 0 && warningCount === 0) {
  console.log('\n🎉 PERFECT - Configuration is Next.js 16 + Netlify ready!');
  process.exit(0);
} else if (criticalCount === 0) {
  console.log('\n✅ GOOD - Configuration is valid with minor warnings');
  process.exit(0);
} else {
  console.log('\n❌ FAILED - Critical issues must be fixed before deployment');
  process.exit(1);
}
