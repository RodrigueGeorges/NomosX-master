#!/usr/bin/env node

/**
 * Restore files from backups after failed massive fix
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

console.log('🔄 RESTORING FILES FROM BACKUPS');
console.log('===============================\n');

function restoreFiles() {
  const backupFiles = fs.readdirSync(BACKUP_DIR);
  let restoredCount = 0;
  
  for (const backupFile of backupFiles) {
    if (backupFile.endsWith('.ts') || backupFile.endsWith('.tsx')) {
      const backupPath = path.join(BACKUP_DIR, backupFile);
      const originalPath = path.join(LIB_DIR, backupFile.replace(/_/g, '/'));
      
      try {
        if (fs.existsSync(backupPath) && fs.existsSync(originalPath)) {
          fs.copyFileSync(backupPath, originalPath);
          restoredCount++;
          console.log(`✅ Restored: ${path.relative(LIB_DIR, originalPath)}`);
        }
      } catch (err) {
        console.error(`❌ Failed to restore ${originalPath}: ${err.message}`);
      }
    }
  }
  
  console.log(`\n📊 RESTORED ${restoredCount} FILES`);
  console.log('🔄 All files have been restored from backups');
}

restoreFiles();
