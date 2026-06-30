import { NextRequest, NextResponse } from 'next/server';
import { processStudioXOrder } from '@/lib/studiox/runner';

export const maxDuration = 900;
export const dynamic = 'force-dynamic';

/**
 * POST /api/studiox/process
 * Internal endpoint — runs the full StudioX pipeline for an order.
 * Called by Netlify background function or as fallback when BG trigger fails.
 * Auth: Bearer CRON_SECRET
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orderId: string;
  try {
    const body = await req.json();
    orderId = String(body.orderId ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  try {
    await processStudioXOrder(orderId);
    return NextResponse.json({ ok: true, orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, orderId, error: message }, { status: 500 });
  }
}
