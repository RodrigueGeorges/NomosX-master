/**
 * Streaming Chat API Route
 * Provides real-time streaming responses using Vercel AI SDK
 */

import { streamLLM } from '@/lib/llm/unified-llm';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import Sentry from '@sentry/nextjs';

// Disable edge runtime for now - use Node.js
// export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: max 20 chat streams per minute per user
    try {
      assertRateLimit(`chat-stream:user:${session.id}`, 20, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) },
        });
      }
      throw err;
    }

    const { messages, temperature, model } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamLLM(
            {
              messages,
              temperature: temperature ?? 0.2,
              model,
              maxTokens: 4000,
            },
            (chunk) => {
              // Send chunk as SSE
              const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          );

          // Send done signal
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          Sentry.captureException(error);
          
          // Send error
          const errorData = `data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stream API error:", error);
    Sentry.captureException(error);
    return new Response("Internal server error", { status: 500 });
  }
}
