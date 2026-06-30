import { NextRequest, NextResponse } from 'next/server';
import { drainStudioXOrders } from '@/lib/studiox/drain';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return Boolean(CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`);
}

/**
 * POST /api/cron/studiox-drain
 * Re-enqueues stuck PAID/QUEUED orders and reclaims stale RUNNING workers.
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await drainStudioXOrders();
    console.log('[Cron/StudioX Drain]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron/StudioX Drain] Error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
