const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const out = "c:/Users/DELL/Desktop/NomosX-master/scripts/regions-out.txt";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const buf = [`TOTAL_LINES=${lines.length}`];
const sections = [[285, 315], [480, 505], [750, 775], [1, 40]];
for (const [a, b] of sections) {
  buf.push(`\n=== L${a}-${b} ===`);
  for (let i = a - 1; i < Math.min(b, lines.length); i++) {
    if (lines[i].trim()) buf.push(`${i + 1}│${lines[i].trim()}`);
  }
}
fs.writeFileSync(out, buf.join("\n"), "utf8");
