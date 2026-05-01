#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";

const start = performance.now();
const json = process.argv.includes("--json");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const result = {
  status: "healthy",
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || "development",
  checks: {},
  metrics: {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    responseTimeMs: 0,
  },
};

function setStatus() {
  const statuses = Object.values(result.checks).map((check) => check.status);
  if (statuses.includes("unhealthy")) result.status = "unhealthy";
  else if (statuses.includes("warning")) result.status = "warning";
  else result.status = "healthy";
}

async function checkDatabase() {
  const checkStart = performance.now();
  if (!process.env.DATABASE_URL) {
    result.checks.database = { status: "unhealthy", error: "DATABASE_URL missing" };
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [users, publications, sources] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.thinkTankPublication.count().catch(() => 0),
      prisma.source.count().catch(() => 0),
    ]);
    result.checks.database = {
      status: "healthy",
      responseTimeMs: Math.round(performance.now() - checkStart),
      details: { users, publications, sources },
    };
  } catch (error) {
    result.checks.database = {
      status: "unhealthy",
      responseTimeMs: Math.round(performance.now() - checkStart),
      error: error.message,
    };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function checkRedisConfig() {
  const hasRedis = !!process.env.REDIS_URL || !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  result.checks.redis = hasRedis
    ? { status: "healthy", details: "configured" }
    : { status: process.env.NODE_ENV === "production" ? "unhealthy" : "warning", details: "not configured" };
}

async function checkAppEndpoint() {
  const checkStart = performance.now();
  try {
    const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`, { method: "GET" });
    result.checks.http = {
      status: response.ok ? "healthy" : "warning",
      statusCode: response.status,
      responseTimeMs: Math.round(performance.now() - checkStart),
    };
  } catch (error) {
    result.checks.http = {
      status: "warning",
      responseTimeMs: Math.round(performance.now() - checkStart),
      error: `App endpoint unavailable: ${error.message}`,
    };
  }
}

function checkEnv() {
  const required = ["DATABASE_URL", "JWT_SECRET", "OPENAI_API_KEY", "ADMIN_KEY", "NEXT_PUBLIC_APP_URL"];
  const missing = required.filter((key) => !process.env[key]);
  result.checks.environment = missing.length
    ? { status: "unhealthy", missing }
    : { status: "healthy" };
}

async function main() {
  checkEnv();
  await Promise.all([checkDatabase(), checkRedisConfig(), checkAppEndpoint()]);
  result.metrics.responseTimeMs = Math.round(performance.now() - start);
  setStatus();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`NomosX health: ${result.status.toUpperCase()}`);
    for (const [name, check] of Object.entries(result.checks)) {
      console.log(`${name}: ${check.status}${check.error ? ` - ${check.error}` : ""}`);
    }
  }

  process.exit(result.status === "unhealthy" ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
