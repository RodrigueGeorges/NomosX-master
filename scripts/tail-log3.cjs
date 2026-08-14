const fs = require('fs');
try {
  const s = fs.readFileSync('scripts/funnel-output3.log', 'utf-8');
  console.log(s.slice(-3000));
} catch(e) {
  console.error('Error:', e.message);
}
