import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import { PrismaClient } from "../generated/prisma-client/index.js";
import { scout, rank, analyst, citationGuard, renderBriefHTML } from "../lib/agent/pipeline.js";

const prisma = new PrismaClient();

async function takeJob() {
  return await prisma.job.findFirst({
    where: { status: "PENDING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
  });
}

async function runLoop() {
  let processed = 0;
  while (true) {
    const job = await takeJob();
    if (!job) break;

    processed += 1;
    await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING" } });

    try {
      if (job.type === "SCOUT") {
        const { query, providers, perProvider } = job.payload;
        await scout(String(query), providers || ["openalex"], Number(perProvider || 20));
        await prisma.job.create({ data: { type: "RANK", payload: { query: String(query) }, priority: 5 } });
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } else if (job.type === "RANK") {
        const { query } = job.payload;
        const top = await rank(String(query), 12);
        await prisma.job.create({ data: { type: "ANALYST", payload: { question: String(query), sourceIds: top.map((s) => s.id) }, priority: 4 } });
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } else if (job.type === "ANALYST") {
        const { question, sourceIds } = job.payload;
        const sources = await prisma.source.findMany({ where: { id: { in: sourceIds } } });
        const out = await analyst(String(question), sources);
        const guard = citationGuard(out, sources.length);
        if (!guard.ok) {
          await prisma.job.create({
            data: { type: "ANALYST", payload: { question: String(question) + " (IMPORTANT: include [SRC-*] tags for claims.)", sourceIds }, priority: 3 }
          });
        } else {
          await prisma.job.create({ data: { type: "EDITOR", payload: { question: String(question), out, sourceIds }, priority: 3 } });
        }
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } else if (job.type === "EDITOR") {
        const { question, out, sourceIds } = job.payload;
        const sources = await prisma.source.findMany({ where: { id: { in: sourceIds } } });
        const html = renderBriefHTML(out, sources);
        const brief = await prisma.brief.create({ data: { kind: "brief", question: String(question), html, sources: sourceIds } });
        await prisma.job.create({ data: { type: "PUBLISHER", payload: { briefId: brief.id }, priority: 2 } });
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } else if (job.type === "PUBLISHER") {
        const { briefId } = job.payload;
        await prisma.brief.update({ where: { id: briefId }, data: { publicId: briefId } });
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } else {
        await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: "Unknown job type" } });
      }
    } catch (e) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: String(e?.message || e) }
      });
    }
  }
  console.log("Processed jobs:", processed);
}

runLoop().then(() => process.exit(0));
