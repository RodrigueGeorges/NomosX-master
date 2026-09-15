const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const out = "c:/Users/DELL/Desktop/NomosX-master/scripts/compact-page-out.txt";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const buf = [];
compact = lines.filter(l => l.trim() !== "");
compact.forEach((l, i) => buf.push(`${String(i + 1).padStart(4)}  ${l.trim()}`));
fs.writeFileSync(out, buf.join("\n"), "utf8");
console.log("done, strippedLines=" + compact.length);
