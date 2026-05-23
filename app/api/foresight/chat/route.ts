/**
 * POST /api/foresight/chat
 * Secure persona chat — persona resolved server-side from publication record
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatWithSimulatedPersona } from "@/lib/agent/simulation-agent";
import { getForesightConfig } from "@/lib/foresight/config";
import { resolvePublicationPersona } from "@/lib/foresight/persona-gate";
import { assertRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ChatSchema = z.object({
  publicationId: z.string().min(1).max(128),
  personaId: z.string().min(1).max(128),
  message: z.string().min(1).max(800),
});

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    const cfg = getForesightConfig();
    if (!cfg.enabled) {
      return NextResponse.json({ error: "Foresight is disabled" }, { status: 503 });
    }

    const ip = clientIp(req);
    try {
      await assertRateLimit(`foresight-chat:ip:${ip}`, cfg.chatRateLimitPerMin, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const body = await req.json();
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { publicationId, personaId, message } = parsed.data;

    const resolved = await resolvePublicationPersona(publicationId, personaId);
    if (!resolved) {
      return NextResponse.json({ error: "Publication or persona not found" }, { status: 404 });
    }

    if (!resolved.question) {
      return NextResponse.json({ error: "Simulation context unavailable" }, { status: 422 });
    }

    const reply = await chatWithSimulatedPersona({
      persona: {
        ...resolved.persona,
        archetype: resolved.persona.archetype as import("@/lib/agent/simulation-agent").PersonaArchetype,
      },
      question: resolved.question,
      userMessage: message,
    });

    return NextResponse.json({ reply, personaId: resolved.persona.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Foresight chat failed";
    console.error("[Foresight Chat]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
