/**
 * Worker V2 - Robust job processor with retries and logging
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import { PrismaClient } from "../generated/prisma-client/index.js";
import {
  scout,
  index,
  rank,
  read,
  analyst,
  citationGuard,
  renderBriefHTML,
  runFullPipeline,
} from "../lib/agent/pipeline-v2.js";

const prisma = new PrismaClient();

async function takeJob() {
  return await prisma.job.findFirst({
    where: { status: "PENDING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

async function processJob(job) {
  const startTime = Date.now();
  
  try {
    console.log(`[Worker] Processing job ${job.id} (${job.type})`);
    
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    switch (job.type) {
      case "FULL_PIPELINE": {
        const { query, providers } = job.payload;
        const result = await runFullPipeline(String(query), providers || ["openalex"]);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "DONE",
            finishedAt: new Date(),
            payload: { ...job.payload, result },
          },
        });
        break;
      }

      case "SCOUT": {
        const { query, providers, perProvider } = job.payload;
        const result = await scout(String(query), providers || ["openalex"], Number(perProvider || 20));
        
        // Enqueue INDEX job
        await prisma.job.create({
          data: {
            type: "INDEX",
            payload: { sourceIds: result.sourceIds },
            priority: 8,
          },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      case "INDEX": {
        const { sourceIds } = job.payload;
        const result = await index(sourceIds);
        
        // Enqueue RANK job
        await prisma.job.create({
          data: {
            type: "RANK",
            payload: { query: job.payload.query || "recent", sourceIds },
            priority: 7,
          },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      case "RANK": {
        const { query } = job.payload;
        const top = await rank(String(query), 12, "quality");
        
        // Enqueue READER job
        await prisma.job.create({
          data: {
            type: "READER",
            payload: { question: String(query), sourceIds: top.map((s) => s.id) },
            priority: 6,
          },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      case "READER": {
        const { question, sourceIds } = job.payload;
        const sources = await prisma.source.findMany({
          where: { id: { in: sourceIds } },
          include: {
            authors: { include: { author: true } },
            institutions: { include: { institution: true } },
          },
        });
        
        const readings = await read(sources);
        
        // Enqueue ANALYST job
        await prisma.job.create({
          data: {
            type: "ANALYST",
            payload: { question: String(question), sourceIds, readings },
            priority: 5,
          },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      case "ANALYST": {
        const { question, sourceIds, readings } = job.payload;
        const sources = await prisma.source.findMany({
          where: { id: { in: sourceIds } },
          include: {
            authors: { include: { author: true } },
            institutions: { include: { institution: true } },
          },
        });
        
        const out = await analyst(String(question), sources, readings);
        const guard = citationGuard(out, sources.length);
        
        if (!guard.ok && job.attempts < job.maxRetries) {
          // Retry with stronger instruction
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "PENDING",
              attempts: { increment: 1 },
              lastError: `Citation guard failed: ${guard.usedCount} citations, ${guard.invalid.length} invalid`,
              payload: {
                ...job.payload,
                question: `${question} (CRITICAL: Include [SRC-*] citations for every claim.)`,
              },
            },
          });
        } else if (!guard.ok) {
          throw new Error(`Citation guard failed after ${job.maxRetries} attempts`);
        } else {
          // Enqueue EDITOR job
          await prisma.job.create({
            data: {
              type: "EDITOR",
              payload: { question: String(question), out, sourceIds },
              priority: 4,
            },
          });
          
          await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE", finishedAt: new Date() },
          });
        }
        break;
      }

      case "EDITOR": {
        const { question, out, sourceIds } = job.payload;
        const sources = await prisma.source.findMany({
          where: { id: { in: sourceIds } },
          include: {
            authors: { include: { author: true } },
            institutions: { include: { institution: true } },
          },
        });
        
        const html = renderBriefHTML(out, sources);
        const brief = await prisma.brief.create({
          data: {
            kind: "brief",
            question: String(question),
            html,
            sources: sourceIds,
          },
        });
        
        // Enqueue PUBLISHER job
        await prisma.job.create({
          data: {
            type: "PUBLISHER",
            payload: { briefId: brief.id },
            priority: 3,
          },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      case "PUBLISHER": {
        const { briefId } = job.payload;
        await prisma.brief.update({
          where: { id: briefId },
          data: { publicId: briefId },
        });
        
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DONE", finishedAt: new Date() },
        });
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Worker] ✓ Job ${job.id} completed in ${duration}ms`);
    
  } catch (error) {
    console.error(`[Worker] ✗ Job ${job.id} failed: ${error.message}`);
    
    // Retry logic
    if (job.attempts < job.maxRetries) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          attempts: { increment: 1 },
          lastError: String(error?.message || error),
        },
      });
      console.log(`[Worker] → Retrying job ${job.id} (attempt ${job.attempts + 1}/${job.maxRetries})`);
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          lastError: String(error?.message || error),
        },
      });
      console.log(`[Worker] → Job ${job.id} failed after ${job.maxRetries} attempts`);
    }
  }
}

async function runLoop() {
  let processed = 0;
  
  while (true) {
    const job = await takeJob();
    if (!job) break;
    
    await processJob(job);
    processed += 1;
  }
  
  console.log(`[Worker] Processed ${processed} job(s)`);
}

// Run
runLoop()
  .then(() => {
    console.log("[Worker] Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Worker] Fatal error:", error);
    process.exit(1);
  });
