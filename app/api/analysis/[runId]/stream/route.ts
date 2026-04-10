/**
 * API Route: Pipeline Progress SSE Stream
 * 
 * P2-9: Server-Sent Events endpoint for real-time pipeline progress.
 * Client connects with GET /api/analysis/[runId]/stream
 */

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { createProgressStream } from '@/lib/agent/pipeline-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { runId } = await params;

  if (!runId || runId.length < 5) {
    return new Response(JSON.stringify({ error: 'Invalid runId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = createProgressStream(runId);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
