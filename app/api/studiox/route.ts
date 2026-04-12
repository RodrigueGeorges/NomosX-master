/**
 * StudioX API — NomosX Research Studio
 *
 * Unlike the generic /api/chat/stream, StudioX:
 * 1. Loads recent published briefs as context
 * 2. Loads active topics
 * 3. Constructs a system prompt with institutional knowledge
 * 4. Can trigger pipeline runs (commission research)
 * 5. Streams responses via SSE
 */

import { callLLM, streamLLM } from '@/lib/llm/unified-llm';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/db';
import Sentry from '@sentry/nextjs';

const STUDIOX_SYSTEM_PROMPT = `You are StudioX — the research assistant at NomosX, an autonomous AI think tank.

YOUR CAPABILITIES:
- Answer questions about any research topic using academic evidence
- Reference specific briefs and sources
- Summarize findings from recent publications
- Suggest new research topics based on weak signals
- Commission new research briefs (ask the user to confirm)

YOUR KNOWLEDGE:
- You have access to recent published briefs and their key findings
- You know active topics and domains
- You understand the multi-stage verification pipeline that produces every brief

YOUR STYLE:
- Concise, evidence-based, no fluff
- Always cite sources when referencing specific findings [SRC-N]
- If uncertain, say so explicitly
- Suggest concrete next steps
- Use markdown formatting for readability

IMPORTANT:
- Never fabricate source references
- If you don't have enough context, say "I don't have enough data on this — would you like me to commission a research brief?"
- Distinguish between what you know from published briefs vs. general knowledge`;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 30 studiox requests per minute
    try {
      assertRateLimit(`studiox:user:${session.id}`, 30, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) },
        });
      }
      throw err;
    }

    const { messages, stream = true } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
    }

    // Load user context
    const userId = session.id;
    const [recentBriefs, userTopics] = await Promise.all([
      prisma.brief.findMany({
        where: { publishedAt: { not: null } }, // Brief model doesn't have userId, filter by published
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          question: true,
          kind: true,
          createdAt: true,
          topic: { select: { name: true } },
        },
      }),
      prisma.topic.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { name: true, isActive: true },
      }),
    ]).catch(() => [[], []]);

    // Build context block
    const briefsContext = (recentBriefs as any[]).length > 0
      ? `\n\nRECENT PUBLISHED BRIEFS:\n${(recentBriefs as any[]).map((b: any, i: number) =>
          `${i + 1}. "${b.question.slice(0, 80)}..." (${b.kind}) — ${b.topic?.name || 'General'} — ${new Date(b.createdAt).toLocaleDateString()}`
        ).join('\n')}`
      : '\n\nNO PUBLISHED BRIEFS AVAILABLE.';

    const topicsContext = (userTopics as any[]).length > 0
      ? `\n\nUSER'S MONITORED TOPICS:\n${(userTopics as any[]).map((t: any) =>
          `- ${t.name} (${t.isActive ? 'Active' : 'Inactive'})`
        ).join('\n')}`
      : '\n\nUSER HAS NO ACTIVE TOPIC SUBSCRIPTIONS.';

    const systemPrompt = STUDIOX_SYSTEM_PROMPT + briefsContext + topicsContext;

    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    // Stream response
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            await streamLLM(
              {
                messages: allMessages,
                temperature: 0.2,
                maxTokens: 4000,
                model: 'gpt-4o',
              },
              (chunk) => {
                const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            console.error('[OmniChat] Streaming error:', error);
            Sentry.captureException(error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming fallback
    const response = await callLLM({
      messages: allMessages,
      temperature: 0.2,
      maxTokens: 4000,
      model: 'gpt-4o',
    });

    return NextResponse.json({
      content: response.content,
      model: response.model,
      tokensInput: response.tokensInput,
      tokensOutput: response.tokensOutput,
      costUsd: response.costUsd,
    });
  } catch (error) {
    console.error('[OmniChat] API error:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
