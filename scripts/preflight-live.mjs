#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const warnings = [];
const checks = [];

function pass(name, detail = "") {
  checks.push({ name, status: "pass", detail });
}

function fail(name, detail) {
  failures.push({ name, detail });
  checks.push({ name, status: "fail", detail });
}

function warn(name, detail) {
  warnings.push({ name, detail });
  checks.push({ name, status: "warn", detail });
}

function hasFile(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0];
}

function env(name) {
  return process.env[name]?.trim() || "";
}

function requireEnv(name, opts = {}) {
  const value = env(name);
  if (!value) return fail(`env:${name}`, "missing");
  if (opts.min && value.length < opts.min) return fail(`env:${name}`, `too short, expected >= ${opts.min} chars`);
  if (opts.url) {
    try {
      const parsed = new URL(value);
      if (opts.https && parsed.protocol !== "https:") return fail(`env:${name}`, "must be HTTPS in production");
    } catch {
      return fail(`env:${name}`, "invalid URL");
    }
  }
  if (opts.noPlaceholder && /change-me|your_|sk-\.\.\.|localhost|example\.com/i.test(value)) {
    return fail(`env:${name}`, "placeholder value detected");
  }
  pass(`env:${name}`);
}

function optionalEnv(name, opts = {}) {
  const value = env(name);
  if (!value) return warn(`env:${name}`, "not configured");
  if (opts.url) {
    try { new URL(value); } catch { return fail(`env:${name}`, "invalid URL"); }
  }
  pass(`env:${name}`);
}

const isJson = process.argv.includes("--json");
const requireProd = process.argv.includes("--prod") || process.env.NODE_ENV === "production";

for (const [command, label] of [["node", "Node.js"], ["npm", "npm"]]) {
  const version = commandVersion(command);
  if (!version) fail(`tool:${command}`, `${label} not found in PATH`);
  else pass(`tool:${command}`, version);
}

for (const file of [
  "package.json",
  "next.config.mjs",
  "prisma/schema.prisma",
  "app/api/health/route.ts",
  "app/api/ready/route.ts",
  "app/api/system/health/route.ts",
  "middleware.ts",
]) {
  if (hasFile(file)) pass(`file:${file}`);
  else fail(`file:${file}`, "missing");
}

requireEnv("DATABASE_URL", { url: true, noPlaceholder: true });
requireEnv("JWT_SECRET", { min: 32, noPlaceholder: true });
requireEnv("OPENAI_API_KEY", { min: 12, noPlaceholder: true });
requireEnv("ADMIN_KEY", { min: requireProd ? 16 : 8, noPlaceholder: true });
requireEnv("NEXT_PUBLIC_APP_URL", { url: true, https: requireProd, noPlaceholder: requireProd });

if (requireProd) {
  requireEnv("CRON_SECRET", { min: 24, noPlaceholder: true });
  if (!env("REDIS_URL") && !(env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN"))) {
    fail("env:redis", "set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN");
  } else {
    pass("env:redis");
  }
  optionalEnv("SENTRY_DSN", { url: true });
  optionalEnv("RESEND_API_KEY");
  optionalEnv("STRIPE_SECRET_KEY");
  optionalEnv("STRIPE_WEBHOOK_SECRET");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const scriptName of ["build", "start", "health", "ci"]) {
  if (packageJson.scripts?.[scriptName]) pass(`script:${scriptName}`);
  else fail(`script:${scriptName}`, "missing package script");
}

const result = {
  status: failures.length === 0 ? (warnings.length ? "warning" : "ready") : "blocked",
  generatedAt: new Date().toISOString(),
  productionMode: requireProd,
  summary: {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: warnings.length,
    failures: failures.length,
  },
  failures,
  warnings,
  checks,
};

if (isJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`NomosX live preflight: ${result.status.toUpperCase()}`);
  for (const check of checks) {
    const mark = check.status === "pass" ? "OK" : check.status === "warn" ? "WARN" : "FAIL";
    console.log(`${mark.padEnd(4)} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
