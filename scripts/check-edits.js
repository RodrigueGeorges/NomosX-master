const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const content = fs.readFileSync(p, "utf8");
const lines = content.split(/\r?\n/);
console.log("TOTAL_LINES=" + lines.length);
["GhostCharField", "MeanderDivider", "nx-principle-band", "nx-hero nx-reveal"].forEach(term => {
  lines.forEach((l, i) => {
    if (l.includes(term)) console.log(`${i + 1}: ${l.trim()}`);
  });
});
