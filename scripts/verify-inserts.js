const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
console.log("TOTAL_LINES=" + lines.length);
lines.forEach((l, i) => {
  if (/GhostCharField|MeanderDivider|nx-principle-band|nx-hero nx-reveal/.test(l)) {
    console.log(`L${i + 1}: ${l.trim()}`);
  }
});
