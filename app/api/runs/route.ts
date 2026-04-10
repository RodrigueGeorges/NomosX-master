
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const admin = req.headers.get("x-admin-key") || "";
  const required = process.env.ADMIN_KEY || "";
  if (!required || admin !== required) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { query, providers, perProvider } = await req.json().catch(() => ({}));
  const q = String(query || "").trim() || "economics";
  const prov = Array.isArray(providers) && providers.length ? providers.map(String) : ["openalex","thesesfr","crossref","semanticscholar"];

  const run = await prisma.ingestionRun.create({ data: { query: q, providers: prov, status: "RUNNING", correlationId: crypto.randomUUID() } });
  await prisma.job.create({ data: { type: "SCOUT", payload: { query: run.query, providers: prov, perProvider: Number(perProvider || 20) }, priority: 10, correlationId: run.correlationId } });
  return NextResponse.json({ runId: run.id });
}
