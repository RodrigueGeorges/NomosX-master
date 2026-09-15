const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const sections = [[285, 300], [485, 505], [750, 775]];
for (const [a, b] of sections) {
  console.log(`\n=== L${a}-${b} ===`);
  for (let i = a - 1; i < Math.min(b, lines.length); i++) {
    if (lines[i].trim()) console.log(`${i + 1}│${lines[i].trim()}`);
  }
}
