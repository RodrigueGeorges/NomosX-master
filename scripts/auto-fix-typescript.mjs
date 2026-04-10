#!/usr/bin/env node

/**
 * AUTOMATIC TYPESCRIPT ERROR FIXER
 * Script professionnel pour analyser et corriger les erreurs TypeScript courantes
 * 
 * Auteur: NomosX Lead Developer
 * Version: 1.0.0
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

interface FixPattern {
  code: string;
  pattern: RegExp;
  replacement: string;
  description: string;
}

class TypeScriptErrorFixer {
  private fixPatterns: FixPattern[] = [
    // Erreurs de type 'unknown' dans les catch blocks
    {
      code: 'TS18046',
      pattern: /error\.message/g,
      replacement: 'error instanceof Error ? error.message : String(error)',
      description: 'Fix unknown error type access'
    },
    
    // Erreurs de propriété manquante dans les objets
    {
      code: 'TS2741',
      pattern: /const mockResults: RegistrySearchResult\[\] = \[\s*{\s*id: `([^`]+)`,\s*title: `([^`]+)`,\s*abstract: `([^`]+)`,\s*authors: \[([^\]]+)\],\s*date: ([^,]+),\s*url: ([^,]+),\s*doi: null,\s*raw: ([^}]+)\s*}\s*\];/gs,
      replacement: (match: string, ...groups: any[]) => {
        return `const mockResults: RegistrySearchResult[] = [
      {
        id: ${groups[0]},
        title: ${groups[1]},
        abstract: ${groups[2]},
        authors: ${groups[3]},
        date: ${groups[4]},
        url: ${groups[5]},
        doi: null,
        provider: providerKey,
        raw: ${groups[6]}
      }
    ];`;
      },
      description: 'Add missing provider property to RegistrySearchResult'
    },
    
    // Erreurs de regex flags ES2018+
    {
      code: 'TS1501',
      pattern: /\/([^\/]+)\/s/g,
      replacement: '/$1/([\\s\\S])',
      description: 'Replace regex dotall flag with ES2017 compatible pattern'
    },
    
    // Erreurs NextRequest.ip
    {
      code: 'TS2339',
      pattern: /request\.ip/g,
      replacement: '(request as any).ip',
      description: 'Fix NextRequest.ip property access'
    },
    
    // Erreurs d'imports avec extensions .ts
    {
      code: 'TS5097',
      pattern: /from '[^']*\.ts'/g,
      replacement: (match: string) => match.replace('.ts', ''),
      description: 'Remove .ts extension from imports'
    },
    
    // Erreurs setTimeout import
    {
      code: 'TS2305',
      pattern: /import\s*{\s*setTimeoutassleep\s*}/g,
      replacement: 'import { setTimeout }',
      description: 'Fix setTimeout import'
    }
  ];

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
    
    // 2. Grouper les erreurs par fichier
    const errorsByFile = this.groupErrorsByFile(errors);
    
    // 3. Appliquer les corrections automatiques
    let totalFixed = 0;
    for (const [file, fileErrors] of Object.entries(errorsByFile)) {
      const fixed = await this.fixFile(file, fileErrors);
      totalFixed += fixed;
      
      if (fixed > 0) {
        console.log(`✅ ${file}: ${fixed} erreur(s) corrigée(s)`);
      } else {
        console.log(`⚠️  ${file}: aucune correction automatique possible`);
      }
    }
    
    console.log(`\n🎯 Total: ${totalFixed} erreur(s) corrigée(s) sur ${errors.length}`);
    
    // 4. Vérifier les erreurs restantes
    const remainingErrors = await this.analyzeErrors();
    if (remainingErrors.length > 0) {
      console.log(`\n⚠️  ${remainingErrors.length} erreur(s) restante(s) nécessitant une correction manuelle:`);
      this.displayRemainingErrors(remainingErrors);
    } else {
      console.log('\n🎉 Toutes les erreurs ont été corrigées automatiquement !');
    }
  }

  private async analyzeErrors(): Promise<TypeScriptError[]> {
    try {
      const output = execSync('npx tsc --noEmit --skipLibCheck', { 
        encoding: 'utf8',
        cwd: process.cwd()
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

  private groupErrorsByFile(errors: TypeScriptError[]): Record<string, TypeScriptError[]> {
    const grouped: Record<string, TypeScriptError[]> = {};
    
    for (const error of errors) {
      if (!grouped[error.file]) {
        grouped[error.file] = [];
      }
      grouped[error.file].push(error);
    }
    
    return grouped;
  }

  private async fixFile(filePath: string, errors: TypeScriptError[]): Promise<number> {
    if (!existsSync(filePath)) {
      console.log(`⚠️  Fichier introuvable: ${filePath}`);
      return 0;
    }
    
    let content = readFileSync(filePath, 'utf8');
    let fixedCount = 0;
    
    // Appliquer les patterns de correction
    for (const pattern of this.fixPatterns) {
      const fileErrors = errors.filter(e => e.code === pattern.code);
      if (fileErrors.length === 0) continue;
      
      const originalContent = content;
      
      if (typeof pattern.replacement === 'function') {
        content = content.replace(pattern.pattern, pattern.replacement);
      } else {
        content = content.replace(pattern.pattern, pattern.replacement);
      }
      
      if (content !== originalContent) {
        fixedCount += fileErrors.length;
        console.log(`   • ${pattern.description}`);
      }
    }
    
    // Corrections spécifiques au fichier
    if (filePath.includes('optimized-coherent-system-enterprise.ts')) {
      fixedCount += this.fixEnterpriseSystem(content, errors);
    }
    
    if (content !== readFileSync(filePath, 'utf8')) {
      writeFileSync(filePath, content, 'utf8');
    }
    
    return fixedCount;
  }

  private fixEnterpriseSystem(content: string, errors: TypeScriptError[]): number {
    let fixed = 0;
    const originalContent = content;
    
    // Corriger les erreurs Prisma Job
    if (content.includes('metadata:') && content.includes('prisma.job.create')) {
      content = content.replace(
        /metadata:\s*{[^}]+}/g,
        'payload: JSON.stringify({ agent, operation, params })'
      );
      fixed++;
    }
    
    // Corriger les erreurs de propriétés manquantes
    if (content.includes('this.metrics') && content.includes('NomosXOrchestratorEnterprise')) {
      // Ajouter les déclarations de propriétés manquantes
      if (!content.includes('mcp: NomosXMCPEnterprise;')) {
        content = content.replace(
          /class NomosXOrchestratorEnterprise {/,
          'class NomosXOrchestratorEnterprise {\n  mcp: NomosXMCPEnterprise;\n  agents: any;\n  queue: any;\n  isProcessing: boolean;\n  metrics: any;\n'
        );
        fixed++;
      }
    }
    
    // Corriger les erreurs de types implicites
    content = content.replace(/async (\w+)\(([^)]+)\)/g, (match, funcName, params) => {
      const typedParams = params.split(',').map((p: string) => {
        const trimmed = p.trim();
        if (trimmed && !trimmed.includes(':')) {
          return `${trimmed}: any`;
        }
        return trimmed;
      }).join(', ');
      
      return `async ${funcName}(${typedParams})`;
    });
    
    if (content !== originalContent) {
      writeFileSync('lib/system/optimized-coherent-system-enterprise.ts', content, 'utf8');
    }
    
    return fixed;
  }

  private displayRemainingErrors(errors: TypeScriptError[]): void {
    const grouped = this.groupErrorsByFile(errors);
    
    for (const [file, fileErrors] of Object.entries(grouped)) {
      console.log(`\n📁 ${file}:`);
      for (const error of fileErrors) {
        console.log(`   • L${error.line}:${error.column} ${error.code} - ${error.message}`);
      }
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
if (require.main === module) {
  main();
}

export { TypeScriptErrorFixer };
