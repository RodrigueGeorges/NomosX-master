import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const checks: Record<string, { status: "ok" | "fail"; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok" };
  } catch (error: any) {
    checks.database = { status: "fail", detail: error?.message || "database unavailable" };
  }

  const hasLlm = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  checks.llm = hasLlm ? { status: "ok" } : { status: "fail", detail: "no LLM provider configured" };

  const hasAuth = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
  checks.auth = hasAuth ? { status: "ok" } : { status: "fail", detail: "JWT_SECRET missing or weak" };

  const isReady = Object.values(checks).every((check) => check.status === "ok");

  return NextResponse.json(
    {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: isReady ? 200 : 503 }
  );
}
