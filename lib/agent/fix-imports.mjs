#!/usr/bin/env node

/**
 * Fix Import Statements Script
 * 
 * Converts default imports to named imports for UI components
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

class ImportFixer {
  constructor() {
    this.projectRoot = process.cwd();
    this.fixes = { files: 0, errors: [] };
  }

  async run() {
    console.log('🔧 Fixing Import Statements...');
    
    const files = await this.getAllFiles(join(this.projectRoot, 'app'), ['.tsx', '.ts']);
    const componentFiles = await this.getAllFiles(join(this.projectRoot, 'components'), ['.tsx', '.ts']);
    
    const allFiles = [...files, ...componentFiles];
    
    for (const filePath of allFiles) {
      try {
        await this.fixFileImports(filePath);
        this.fixes.files++;
      } catch (error) {
        this.fixes.errors.push(`${filePath}: ${error.message}`);
      }
    }

    console.log(`✅ Fixed imports in ${this.fixes.files} files`);
    if (this.fixes.errors.length > 0) {
      console.log(`❌ Errors in ${this.fixes.errors.length} files`);
    }
  }

  async fixFileImports(filePath) {
    let content = readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Fix specific UI component imports
    const importFixes = {
      'import Input from "@/components/ui/Input"': 'import { Input } from "@/components/ui/Input"',
      'import Textarea from "@/components/ui/Textarea"': 'import { Textarea } from "@/components/ui/Textarea"',
      'import Button from "@/components/ui/Button"': 'import { Button } from "@/components/ui/Button"',
      'import Modal from "@/components/ui/Modal"': 'import { Modal } from "@/components/ui/Modal"',
      'import Card from "@/components/ui/Card"': 'import { Card } from "@/components/ui/Card"',
      'import Badge from "@/components/ui/Badge"': 'import { Badge } from "@/components/ui/Badge"',
      'import Switch from "@/components/ui/Switch"': 'import { Switch } from "@/components/ui/Switch"',
      'import Select from "@/components/ui/Select"': 'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"',
      'import Label from "@/components/ui/Label"': 'import { Label } from "@/components/ui/Label"',
      'import Toast from "@/components/ui/Toast"': 'import { Toast } from "@/components/ui/Toast"',
      'import Tooltip from "@/components/ui/Tooltip"': 'import { Tooltip } from "@/components/ui/Tooltip"',
      'import Dialog from "@/components/ui/Dialog"': 'import { Dialog } from "@/components/ui/Dialog"',
      'import DropdownMenu from "@/components/ui/DropdownMenu"': 'import { DropdownMenu } from "@/components/ui/DropdownMenu"',
      'import Skeleton from "@/components/ui/Skeleton"': 'import { Skeleton } from "@/components/ui/Skeleton"',
      'import LoadingSpinner from "@/components/ui/LoadingSpinner"': 'import { LoadingSpinner } from "@/components/ui/LoadingSpinner"',
      'import EmptyState from "@/components/ui/EmptyState"': 'import { EmptyState } from "@/components/ui/EmptyState"',
      'import DataViz from "@/components/ui/DataViz"': 'import { DataViz } from "@/components/ui/DataViz"',
    };

    for (const [oldImport, newImport] of Object.entries(importFixes)) {
      content = content.replace(new RegExp(oldImport, 'g'), newImport);
    }

    // Fix Card imports specifically
    content = content.replace(
      /import \{ Card, CardContent, CardHeader \} from "@\/components\/ui\/Card"/g,
      'import { Card, CardContent, CardHeader } from "@/components/ui/Card"'
    );

    // Fix Select imports specifically
    content = content.replace(
      /import \{ Select, SelectContent, SelectItem, SelectTrigger, SelectValue \} from "@\/components\/ui\/Select"/g,
      'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"'
    );

    if (content !== originalContent) {
      writeFileSync(filePath, content, 'utf8');
    }
  }

  async getAllFiles(dir, extensions = []) {
    const { readdirSync, statSync } = await import('fs');
    const { join } = await import('path');
    const files = [];
    
    if (!existsSync(dir)) return files;
    
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath, extensions));
      } else if (extensions.length === 0 || extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
}

// Run the import fixer
const fixer = new ImportFixer();
fixer.run().catch(console.error);
