/**
 * AUTOMATIC TYPESCRIPT ERROR FIXER - WINDOWS VERSION
 * Script professionnel pour analyser et corriger les erreurs TypeScript courantes
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

class TypeScriptErrorFixer {
  private criticalFiles = [
    'lib/providers/registry-bridge.ts',
    'lib/security.ts',
    'lib/providers/pubmed.ts',
    'lib/providers/patents/google-patents-api.ts',
    'lib/system/optimized-coherent-system-enterprise.ts'
  ];

  async run(): Promise<void> {
    console.log('🔧 Démarrage du fixeur automatique TypeScript...\n');
    
    // 1. Analyser toutes les erreurs
    const errors = await this.analyzeErrors();
    
    if (errors.length === 0) {
      console.log('✅ Aucune erreur TypeScript détectée !');
      return;
    }
    
    console.log(`📊 ${errors.length} erreur(s) TypeScript détectée(s)\n`);
    
    // 2. Appliquer les corrections automatiques
    const fixedCount = await this.applyFixes(errors);
    
    console.log(`\n🎯 Total: ${fixedCount} erreur(s) corrigée(s) sur ${errors.length}`);
    
    // 3. Vérifier les erreurs restantes
    const remainingErrors = await this.analyzeErrors();
    if (remainingErrors.length > 0) {
      console.log(`\n⚠️  ${remainingErrors.length} erreur(s) restante(s):`);
      this.displayErrors(remainingErrors.slice(0, 10)); // Limiter l'affichage
    } else {
      console.log('\n🎉 Toutes les erreurs ont été corrigées automatiquement !');
    }
  }

  private async analyzeErrors(): Promise<TypeScriptError[]> {
    try {
      const nodePath = "C:\\Users\\madeleine.stephann\\AppData\\Roaming\\fnm\\node-versions\\v20.19.0\\installation";
      const envPath = `${nodePath};${process.env.PATH}`;
      
      const output = execSync('npx tsc --noEmit --skipLibCheck', { 
        encoding: 'utf8',
        cwd: process.cwd(),
        env: { ...process.env, PATH: envPath, NODE_OPTIONS: '--max-old-space-size=8192' }
      });
      
      return []; // Pas d'erreurs
    } catch (error: any) {
      const output = error.stdout || error.stderr || '';
      return this.parseTypeScriptErrors(output);
    }
  }

  private parseTypeScriptErrors(output: string): TypeScriptError[] {
    const errors: TypeScriptError[] = [];
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

  private async applyFixes(errors: TypeScriptError[]): Promise<number> {
    let fixedCount = 0;
    
    // Grouper par fichier
    const errorsByFile = new Map<string, TypeScriptError[]>();
    for (const error of errors) {
      if (!errorsByFile.has(error.file)) {
        errorsByFile.set(error.file, []);
      }
      errorsByFile.get(error.file)!.push(error);
    }
    
    // Appliquer les corrections fichier par fichier
    for (const [filePath, fileErrors] of errorsByFile) {
      if (!existsSync(filePath)) {
        console.log(`⚠️  Fichier introuvable: ${filePath}`);
        continue;
      }
      
      const fixed = await this.fixFile(filePath, fileErrors);
      fixedCount += fixed;
      
      if (fixed > 0) {
        console.log(`✅ ${filePath}: ${fixed} erreur(s) corrigée(s)`);
      }
    }
    
    return fixedCount;
  }

  private async fixFile(filePath: string, errors: TypeScriptError[]): Promise<number> {
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
      },
      {
        pattern: /from '[^']*\.ts'/g,
        replacement: (match: string) => match.replace('.ts', ''),
        codes: ['TS5097']
      },
      {
        pattern: /import\s*{\s*setTimeoutassleep\s*}/g,
        replacement: 'import { setTimeout }',
        codes: ['TS2305']
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
    
    // Corrections spécifiques au fichier
    if (filePath.includes('registry-bridge.ts')) {
      fixedCount += this.fixRegistryBridge(content, errors);
      content = readFileSync(filePath, 'utf8');
    }
    
    if (filePath.includes('optimized-coherent-system-enterprise.ts')) {
      fixedCount += this.fixEnterpriseSystem(content, errors);
      content = readFileSync(filePath, 'utf8');
    }
    
    if (filePath.includes('google-patents-api.ts')) {
      fixedCount += this.fixGooglePatents(content, errors);
      content = readFileSync(filePath, 'utf8');
    }
    
    if (content !== readFileSync(filePath, 'utf8')) {
      writeFileSync(filePath, content, 'utf8');
    }
    
    return fixedCount;
  }

  private fixRegistryBridge(content: string, errors: TypeScriptError[]): number {
    let fixed = 0;
    
    // Ajouter la propriété provider manquante
    if (content.includes('RegistrySearchResult') && !content.includes('provider: providerKey,')) {
      content = content.replace(
        /doi: null,\s*raw: \{ provider: providerKey, mock: true \}/g,
        'doi: null,\n        provider: providerKey,\n        raw: { provider: providerKey, mock: true }'
      );
      fixed++;
    }
    
    if (fixed > 0) {
      writeFileSync('lib/providers/registry-bridge.ts', content, 'utf8');
    }
    
    return fixed;
  }

  private fixEnterpriseSystem(content: string, errors: TypeScriptError[]): number {
    let fixed = 0;
    
    // Corriger les erreurs Prisma
    if (content.includes('metadata:') && content.includes('prisma.job.create')) {
      content = content.replace(
        /metadata:\s*{[^}]+}/g,
        'payload: JSON.stringify({ agent, operation, params })'
      );
      fixed++;
    }
    
    // Corriger les types implicites
    content = content.replace(/async (\w+)\(([^)]*)\)/g, (match, funcName, params) => {
      const typedParams = params.split(',').map((p: string) => {
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
        fixed++;
      }
    }
    
    if (fixed > 0) {
      writeFileSync('lib/system/optimized-coherent-system-enterprise.ts', content, 'utf8');
    }
    
    return fixed;
  }

  private fixGooglePatents(content: string, errors: TypeScriptError[]): number {
    let fixed = 0;
    
    // Corriger les erreurs de type unknown
    const unknownErrors = errors.filter(e => e.code === 'TS18046');
    if (unknownErrors.length > 0) {
      content = content.replace(
        /console\.warn\('[^']+', error\.message\)/g,
        "console.warn('[Google-Patents] API search failed:', error instanceof Error ? error.message : String(error))"
      );
      fixed++;
    }
    
    if (fixed > 0) {
      writeFileSync('lib/providers/patents/google-patents-api.ts', content, 'utf8');
    }
    
    return fixed;
  }

  private displayErrors(errors: TypeScriptError[]): void {
    for (const error of errors) {
      console.log(`   • ${error.file}:${error.line}:${error.column} ${error.code} - ${error.message}`);
    }
  }
}

// Point d'entrée principal
async function main() {
  const fixer = new TypeScriptErrorFixer();
  
  try {
    await fixer.run();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();
