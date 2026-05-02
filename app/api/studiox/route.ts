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
import { PUBLICATION_FORMATS, getPublicationFormat } from '@/lib/publication-formats';

const STUDIOX_SYSTEM_PROMPT = `You are StudioX — the research assistant at NomosX, an autonomous AI think tank.

YOUR CAPABILITIES:
- Triage the user's intent into one of five modes: ASK, COMMISSION, MONITOR, COMPARE, BOARD_MEMO
- Answer questions using published NomosX evidence when available
- Reference specific publications and sources only when they are present in context
- Summarize findings from recent publications
- Suggest new research topics based on weak signals and monitored topics
- Commission new research mandates after asking for confirmation
- Convert messy executive questions into scoped research mandates

YOUR KNOWLEDGE:
- You have access to recent published publications and their key findings
- You know active topics and domains
- You understand the multi-stage verification pipeline that produces every publication
- You understand the publication gate: source depth, citation coverage, dissent, researcher sign-off, and adversarial review

YOUR STYLE:
- Concise, evidence-based, no fluff
- Always cite sources when referencing specific findings [SRC-N]
- If uncertain, say so explicitly
- Suggest concrete next steps
- Use markdown formatting for readability
- Write like a senior research director: precise, calm, decision-ready

IMPORTANT:
- Never fabricate source references
- Never invent a publication, source, score, or citation tag that is not in context
- If a user asks for a strategic answer without enough evidence, give a scoped hypothesis and label it as such
- If you don't have enough context, say "I don't have enough data on this — would you like me to commission a StudioX mandate?"
- Distinguish between what you know from published NomosX work vs. general knowledge`;

function buildFormatCatalog() {
  return PUBLICATION_FORMATS.map((format) =>
    `- ${format.label} (${format.type}): ${format.pages}, ${format.sourceDepth}. ${format.description}`
  ).join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 30 studiox requests per minute
    try {
      await assertRateLimit(`studiox:user:${session.id}`, 30, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) },
        });
      }
      throw err;
    }

    const { messages, stream = true, studioContext = {}, orderId } = await req.json();

    // Verify paid order
    if (orderId) {
      const order = await prisma.studioXOrder.findFirst({
        where: { id: orderId, userId: session.id },
      });
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (order.status !== 'PAID') {
        return NextResponse.json({ error: 'Payment required', requiredAction: 'pay' }, { status: 402 });
      }
      if (order.result) {
        // Already completed — return cached result
        return NextResponse.json({ content: order.result, cached: true });
      }
    }
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
    }
    const selectedFormat = getPublicationFormat(studioContext?.formatType);

    // Load publication and topic context
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
    const briefsContext = recentBriefs.length > 0
      ? `\n\nRECENT PUBLISHED PUBLICATIONS:\n${recentBriefs.map((b, i: number) =>
          `${i + 1}. "${b.question.slice(0, 80)}..." (${b.kind}) — ${b.topic?.name || 'General'} — ${new Date(b.createdAt).toLocaleDateString()}`
        ).join('\n')}`
      : '\n\nNO PUBLISHED PUBLICATIONS AVAILABLE.';

    const topicsContext = userTopics.length > 0
      ? `\n\nUSER'S MONITORED TOPICS:\n${userTopics.map((t) =>
          `- ${t.name} (${t.isActive ? 'Active' : 'Inactive'})`
        ).join('\n')}`
      : '\n\nUSER HAS NO ACTIVE TOPIC SUBSCRIPTIONS.';

    const studioContextBlock = `\n\nCURRENT STUDIOX MANDATE:
- Mode: ${studioContext?.mode || 'COMMISSION'}
- Selected format: ${selectedFormat.label} (${selectedFormat.type})
- Expected depth: ${selectedFormat.pages}; ${selectedFormat.sourceDepth}
- Audience: ${studioContext?.audience || 'Decision-makers'}
- Urgency: ${studioContext?.urgency || 'Standard'}

AVAILABLE PUBLICATION FORMATS:
${buildFormatCatalog()}`;

    const systemPrompt = STUDIOX_SYSTEM_PROMPT + studioContextBlock + briefsContext + topicsContext;

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

    // Persist result on the order
    if (orderId && response.content) {
      await prisma.studioXOrder.update({
        where: { id: orderId },
        data: { result: response.content, completedAt: new Date() },
      }).catch(() => {});
    }

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
