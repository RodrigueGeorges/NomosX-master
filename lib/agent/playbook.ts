/**
 * PLAYBOOK — ACE-style evolving context (Agentic Context Engineering, ICLR 2026).
 *
 * Instead of static prompts, each agent role maintains a curated playbook of
 * durable strategy bullets that accumulate, refine, and get pruned over runs.
 * Unlike distilled summaries (which suffer brevity bias / context collapse),
 * entries are structured, incremental, and individually scored — the store
 * keeps the detail, the prompt only carries the current best slice.
 *
 * Store: `agentAuditLog` rows (action: PLAYBOOK_DELTA) — zero schema change,
 * same pattern as durable-execution state and persistent signals.
 *
 * Delta ops:
 *  - add      : new strategy bullet
 *  - upvote   : a run where this bullet's advice held
 *  - downvote : a run where following it hurt
 *  - deprecate: bullet retired (kept in log, excluded from prompt)
 *
 * Ranking: score = upvotes − downvotes, then recency. Only the top slice is
 * injected — the playbook grows, the prompt doesn't.
 */

import { prisma } from "../db";
import { callLLM } from "../llm/unified-llm";
import { parseJson } from "./json-utils";

export type PlaybookOp = "add" | "upvote" | "downvote" | "deprecate";

export interface PlaybookBullet {
  id: string;            // stable id: role + normalized text hash
  text: string;
  score: number;         // upvotes − downvotes
  deprecated: boolean;
  updatedAt: string;
}

const ACTION = "PLAYBOOK_DELTA";
const MAX_BULLETS_IN_PROMPT = 6;
const LOOKBACK_ROWS = 300;

/** Normalized dedup key — collapse whitespace, lowercase, cap length. */
function bulletId(role: string, text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${role}:${h.toString(36)}`;
}

/** Record a playbook delta. Deterministic — usable from tests and gates. */
export async function recordPlaybookDelta(
  role: string,
  text: string,
  op: PlaybookOp,
  source: string,
): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: `playbook:${role}`,
        action: ACTION,
        resource: bulletId(role, text),
        metadata: JSON.stringify({ role, op, text: text.slice(0, 500), source }),
      } as any,
    });
  } catch (err) {
    console.warn(`[PLAYBOOK] delta write failed for ${role} (non-blocking):`, err);
  }
}

/** Materialize the current playbook for a role by folding the delta log. */
export async function getPlaybook(role: string): Promise<PlaybookBullet[]> {
  let rows: { resource: string | null; metadata: string | null; timestamp: Date }[] = [];
  try {
    rows = await prisma.agentAuditLog.findMany({
      where: { agent: `playbook:${role}`, action: ACTION },
      orderBy: { timestamp: "desc" },
      take: LOOKBACK_ROWS,
      select: { resource: true, metadata: true, timestamp: true },
    });
  } catch (err) {
    console.warn(`[PLAYBOOK] read failed for ${role} (non-blocking):`, err);
    return [];
  }

  // Oldest-first fold so deltas apply in order.
  const byId = new Map<string, PlaybookBullet>();
  for (const row of rows.reverse()) {
    let meta: { op?: PlaybookOp; text?: string };
    try {
      meta = JSON.parse(row.metadata || "{}");
    } catch {
      continue;
    }
    if (!meta.op || !meta.text || !row.resource) continue;
    const existing = byId.get(row.resource) ?? {
      id: row.resource,
      text: meta.text,
      score: 0,
      deprecated: false,
      updatedAt: row.timestamp.toISOString(),
    };
    existing.updatedAt = row.timestamp.toISOString();
    if (meta.op === "upvote") existing.score += 1;
    else if (meta.op === "downvote") existing.score -= 1;
    else if (meta.op === "deprecate") existing.deprecated = true;
    else if (meta.op === "add" && !byId.has(row.resource)) byId.set(row.resource, existing);
    else if (meta.op === "add") byId.set(row.resource, existing);
    continue;
  }

  return [...byId.values()]
    .filter((b) => !b.deprecated)
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
}

/** Prompt block for injection into a role's system prompt. Empty string when
 *  the playbook is empty — callers can append unconditionally. */
export async function getPlaybookBlock(
  role: string,
  opts?: { maxBullets?: number },
): Promise<string> {
  const bullets = (await getPlaybook(role)).slice(0, opts?.maxBullets ?? MAX_BULLETS_IN_PROMPT);
  if (bullets.length === 0) return "";
  const lines = bullets.map((b) => `- ${b.text}`).join("\n");
  return `\n\nEVOLVING PLAYBOOK (durable lessons this role has accumulated — apply them, they were earned):\n${lines}`;
}

/**
 * Curate the playbook after a run: distill ≤3 durable bullets from the run's
 * lessons/failure patterns, dedupe against existing entries. Non-blocking,
 * one cheap LLM call — skipped entirely when nothing new to distill.
 */
export async function curatePlaybook(
  role: string,
  signal: { lessons: string[]; failurePatterns: Record<string, number>; outcome: "published" | "held" | "failed" },
): Promise<{ added: number }> {
  const fresh = signal.lessons.slice(0, 8);
  const topFailures = Object.entries(signal.failurePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} ×${v}`);
  if (fresh.length === 0 && topFailures.length === 0) return { added: 0 };

  const existing = (await getPlaybook(role)).map((b) => b.text);
  try {
    const res = await callLLM({
      messages: [
        {
          role: "system",
          content:
            "You curate an agent's evolving strategy playbook. From run feedback, emit at most 3 NEW durable bullets (reusable strategies or warnings — not run-specific facts). Do not repeat existing entries. Return JSON only: {\"bullets\":[\"...\"]} or {\"bullets\":[]} when nothing durable.",
        },
        {
          role: "user",
          content: `RUN OUTCOME: ${signal.outcome}\nLESSONS:\n${fresh.join("\n") || "(none)"}\nFAILURE PATTERNS:\n${topFailures.join("\n") || "(none)"}\n\nEXISTING PLAYBOOK:\n${existing.join("\n") || "(empty)"}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 400,
      jsonMode: true,
      task: "query_enhancement",
      enableCache: false,
    });
    const parsed = parseJson<{ bullets?: string[] }>(res.content);
    const bullets = (parsed?.bullets ?? [])
      .filter((b): b is string => typeof b === "string" && b.trim().length > 20)
      .slice(0, 3);
    for (const b of bullets) {
      await recordPlaybookDelta(role, b.trim(), "add", `curate:${signal.outcome}`);
    }
    return { added: bullets.length };
  } catch (err) {
    console.warn(`[PLAYBOOK] curate failed for ${role} (non-blocking):`, err);
    return { added: 0 };
  }
}
