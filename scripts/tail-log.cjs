const fs = require('fs');
try {
  const s = fs.readFileSync('scripts/funnel-output2.log', 'utf-8');
  // Last 3000 chars
  console.log(s.slice(-3000));
} catch(e) {
  console.error('Error:', e.message);
}
