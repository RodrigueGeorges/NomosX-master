// Preload script to capture build errors with full stack trace
// Usage: NODE_OPTIONS="--require ./scripts/preload-trace.cjs" npm run build

const loadedFiles = [];

process.on('unhandledRejection', (reason) => {
  if (reason && reason.message) {
    console.error('\n========================================');
    console.error('UNHANDLED REJECTION INTERCEPTED');
    console.error('========================================');
    console.error('Message:', reason.message);
    console.error('\nFull stack:');
    console.error(reason.stack);
    console.error('\nLast 20 files loaded:');
    loadedFiles.slice(-20).forEach(f => console.error('  ', f));
    console.error('========================================\n');
  }
});

// Patch Module._compile to detect which file triggers the error
const Module = require('module');
const origCompile = Module.prototype._compile;

Module.prototype._compile = function(content, filename) {
  loadedFiles.push(filename);
  try {
    return origCompile.call(this, content, filename);
  } catch (err) {
    if (err.message && (
      err.message.includes('exports is not defined') ||
      err.message.includes('Cannot use import statement') ||
      err.message.includes('Unexpected token')
    )) {
      console.error('\n========================================');
      console.error('COMPILE ERROR IN FILE:', filename);
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
      console.error('\nLast 10 files loaded:');
      loadedFiles.slice(-10).forEach(f => console.error('  ', f));
      console.error('========================================\n');
    }
    throw err;
  }
};
