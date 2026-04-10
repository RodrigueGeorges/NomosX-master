#!/usr/bin/env node
/**
 * 🔍 Trace l'erreur "exports is not defined" en interceptant le process
 */

// Intercepter l'erreur AVANT que Next.js ne la masque
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n🔴 UNHANDLED REJECTION CAUGHT:');
  console.error('Reason:', reason);
  if (reason && reason.stack) {
    console.error('\n📍 FULL STACK TRACE:');
    console.error(reason.stack);
  }
  process.exit(1);
});

// Monkey-patch require pour tracer les fichiers chargés
const Module = await import('module');
const originalLoad = Module.default._load;
const loadedFiles = [];

Module.default._load = function(request, parent, isMain) {
  if (parent && parent.filename && !parent.filename.includes('node_modules')) {
    loadedFiles.push({
      request,
      from: parent.filename
    });
  }
  try {
    return originalLoad.apply(this, arguments);
  } catch (err) {
    if (err.message && err.message.includes('exports is not defined')) {
      console.error('\n🔴 EXPORTS ERROR FOUND!');
      console.error(`📁 File: ${request}`);
      console.error(`📁 Loaded from: ${parent ? parent.filename : 'unknown'}`);
      console.error(`📍 Stack: ${err.stack}`);
      console.error('\n📋 Last 20 files loaded:');
      loadedFiles.slice(-20).forEach(f => {
        console.error(`   ${f.request} (from ${f.from})`);
      });
      process.exit(1);
    }
    throw err;
  }
};

// Lancer next build
const { execSync } = await import('child_process');
try {
  execSync('npx next build --webpack', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: '--stack-trace-limit=100'
    }
  });
} catch (e) {
  // Build failed - check last loaded files
  console.error('\n📋 Last 30 files loaded before crash:');
  loadedFiles.slice(-30).forEach(f => {
    console.error(`   ${f.request} (from ${f.from})`);
  });
}
