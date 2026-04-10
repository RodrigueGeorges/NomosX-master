import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env");

// Force read and parse .env file manually
try {
  const envContent = readFileSync(envPath, "utf-8");
  console.log(`[DEBUG] .env file found at: ${envPath}`);
  console.log(`[DEBUG] .env file size: ${envContent.length} bytes`);
  
  const result = dotenv.config({ path: envPath, override: true });
  
  if (result.error) {
    console.error(`[ERROR] Failed to load .env:`, result.error);
  } else {
    console.log(`[SUCCESS] Loaded ${Object.keys(result.parsed || {}).length} environment variables`);
  }
} catch (error) {
  console.error(`[ERROR] Cannot read .env file:`, error.message);
}

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL is not set!");
  process.exit(1);
}

import { PrismaClient } from "../generated/prisma-client/index.js";
const prisma = new PrismaClient();
await prisma.topic.upsert({
  where: { name: "AI & Labour" },
  update: {},
  create: { name: "AI & Labour", query: "AI and labor markets in Europe", tags: ["ai","labor","europe"] }
});
console.log("Seed done.");
process.exit(0);
