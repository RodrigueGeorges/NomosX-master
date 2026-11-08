const fs = require("fs");
const p = "c:/Users/DELL/Desktop/NomosX-master/app/[locale]/page.tsx";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const compact = lines.filter(l => l.trim() !== "");
compact.forEach((l, i) => console.log(`${String(i + 1).padStart(4)}  ${l}`));
