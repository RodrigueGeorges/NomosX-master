import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const pub = await p.thinkTankPublication.findUnique({
    where: { publicId: "s16-innovation-audit-final" },
    select: { html: true },
  });
  if (!pub) { console.log("NOT FOUND"); return; }
  const h = pub.html;

  // Team cards
  const teamMatches = [...h.matchAll(/<div class="team-card">([\s\S]*?)<\/div>\s*<\/div>/gi)];
  console.log("=== TEAM CARDS:", teamMatches.length, "===\n");
  teamMatches.slice(0, 4).forEach((t, i) => {
    console.log(`--- CARD ${i} ---`);
    console.log(t[1].substring(0, 400));
    console.log();
  });

  // Scenarios
  const scenMatches = [...h.matchAll(/<div class="scenario-row">([\s\S]*?)<\/div>\s*<\/div>/gi)];
  console.log("\n=== SCENARIOS:", scenMatches.length, "===\n");
  scenMatches.slice(0, 4).forEach((s, i) => {
    console.log(`--- SCENARIO ${i} ---`);
    console.log(s[1].substring(0, 500));
    console.log();
  });

  // Dedicated team section
  const teamSection = h.match(/Dedicated team[\s\S]{0,1500}/i);
  if (teamSection) {
    console.log("\n=== DEDICATED TEAM SECTION ===\n");
    console.log(teamSection[0].substring(0, 800));
  }

  // Probable futures section
  const futuresSection = h.match(/Probable futures[\s\S]{0,1500}/i);
  if (futuresSection) {
    console.log("\n=== PROBABLE FUTURES SECTION ===\n");
    console.log(futuresSection[0].substring(0, 800));
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
