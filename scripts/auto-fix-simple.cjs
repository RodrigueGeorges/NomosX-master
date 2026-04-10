/**
 * AUTOMATIC TYPESCRIPT ERROR FIXER - SIMPLE VERSION
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');

async function main() {
  console.log('🔧 Démarrage du fixeur automatique TypeScript...\n');
  
  // 1. Analyser les erreurs
  const errors = await analyzeErrors();
  
  if (errors.length === 0) {
    console.log('✅ Aucune erreur TypeScript détectée !');
    return;
  }
  
  console.log(`📊 ${errors.length} erreur(s) TypeScript détectée(s)\n`);
  
  // 2. Appliquer les corrections
  const fixedCount = await applyFixes(errors);
  
  console.log(`\n🎯 Total: ${fixedCount} erreur(s) corrigée(s) sur ${errors.length}`);
  
  // 3. Vérifier les erreurs restantes
  const remainingErrors = await analyzeErrors();
  if (remainingErrors.length > 0) {
    console.log(`\n⚠️  ${remainingErrors.length} erreur(s) restante(s):`);
    displayErrors(remainingErrors.slice(0, 10));
  } else {
    console.log('\n🎉 Toutes les erreurs ont été corrigées automatiquement !');
  }
}

async function analyzeErrors() {
  try {
    const nodePath = "C:\\Users\\madeleine.stephann\\AppData\\Roaming\\fnm\\node-versions\\v20.19.0\\installation";
    const envPath = `${nodePath};${process.env.PATH}`;
    
    execSync('npx tsc --noEmit --skipLibCheck', { 
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, PATH: envPath, NODE_OPTIONS: '--max-old-space-size=8192' }
    });
    
    return []; // Pas d'erreurs
  } catch (error) {
    const output = error.stdout || error.stderr || '';
    return parseTypeScriptErrors(output);
  }
}

function parseTypeScriptErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    const match = line.match(/([^(]+)\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*(.+)/);
    if (match) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5]
      });
    }
  }
  
  return errors;
}

async function applyFixes(errors) {
  let fixedCount = 0;
  
  // Grouper par fichier
  const errorsByFile = new Map();
  for (const error of errors) {
    if (!errorsByFile.has(error.file)) {
      errorsByFile.set(error.file, []);
    }
    errorsByFile.get(error.file).push(error);
  }
  
  // Appliquer les corrections fichier par fichier
  for (const [filePath, fileErrors] of errorsByFile) {
    if (!existsSync(filePath)) {
      console.log(`⚠️  Fichier introuvable: ${filePath}`);
      continue;
    }
    
    const fixed = await fixFile(filePath, fileErrors);
    fixedCount += fixed;
    
    if (fixed > 0) {
      console.log(`✅ ${filePath}: ${fixed} erreur(s) corrigée(s)`);
    }
  }
  
  return fixedCount;
}

async function fixFile(filePath, errors) {
  let content = readFileSync(filePath, 'utf8');
  let fixedCount = 0;
  
  // Corrections génériques
  const fixes = [
    {
      pattern: /error\.message/g,
      replacement: 'error instanceof Error ? error.message : String(error)',
      codes: ['TS18046']
    },
    {
      pattern: /request\.ip/g,
      replacement: '(request as any).ip',
      codes: ['TS2339']
    },
    {
      pattern: /\/([^\/]+)\/s/g,
      replacement: '/$1/([\\\\s\\\\S])',
      codes: ['TS1501']
    }
  ];
  
  // Appliquer les corrections
  for (const fix of fixes) {
    const fileErrors = errors.filter(e => fix.codes.includes(e.code));
    if (fileErrors.length === 0) continue;
    
    const originalContent = content;
    content = content.replace(fix.pattern, fix.replacement);
    
    if (content !== originalContent) {
      fixedCount += fileErrors.length;
    }
  }
  
  // Corrections spécifiques
  if (filePath.includes('registry-bridge.ts')) {
    if (content.includes('RegistrySearchResult') && !content.includes('provider: providerKey,')) {
      content = content.replace(
        /doi: null,\s*raw: \{ provider: providerKey, mock: true \}/g,
        'doi: null,\n        provider: providerKey,\n        raw: { provider: providerKey, mock: true }'
      );
      fixedCount++;
    }
  }
  
  if (filePath.includes('optimized-coherent-system-enterprise.ts')) {
    // Corriger les erreurs Prisma
    if (content.includes('metadata:') && content.includes('prisma.job.create')) {
      content = content.replace(
        /metadata:\s*{[^}]+}/g,
        'payload: JSON.stringify({ agent, operation, params })'
      );
      fixedCount++;
    }
    
    // Corriger les types implicites
    content = content.replace(/async (\w+)\(([^)]*)\)/g, (match, funcName, params) => {
      const typedParams = params.split(',').map(p => {
        const trimmed = p.trim();
        if (trimmed && !trimmed.includes(':')) {
          return `${trimmed}: any`;
        }
        return trimmed;
      }).join(', ');
      
      return `async ${funcName}(${typedParams})`;
    });
    
    // Ajouter les propriétés manquantes
    if (content.includes('class NomosXOrchestratorEnterprise')) {
      if (!content.includes('mcp: NomosXMCPEnterprise;')) {
        content = content.replace(
          /class NomosXOrchestratorEnterprise {/,
          'class NomosXOrchestratorEnterprise {\n  mcp: NomosXMCPEnterprise;\n  agents: any;\n  queue: any;\n  isProcessing: boolean;\n  metrics: any;\n'
        );
        fixedCount++;
      }
    }
  }
  
  if (filePath.includes('google-patents-api.ts')) {
    const unknownErrors = errors.filter(e => e.code === 'TS18046');
    if (unknownErrors.length > 0) {
      content = content.replace(
        /console\.warn\('[^']+', error\.message\)/g,
        "console.warn('[Google-Patents] API search failed:', error instanceof Error ? error.message : String(error))"
      );
      fixedCount++;
    }
  }
  
  if (content !== readFileSync(filePath, 'utf8')) {
    writeFileSync(filePath, content, 'utf8');
  }
  
  return fixedCount;
}

function displayErrors(errors) {
  for (const error of errors) {
    console.log(`   • ${error.file}:${error.line}:${error.column} ${error.code} - ${error.message}`);
  }
}

// Exécuter
main().catch(console.error);
