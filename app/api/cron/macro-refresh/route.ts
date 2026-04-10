import { NextRequest,NextResponse } from 'next/server';
import { refreshMacroSeries } from '@/lib/agent/macro-refresh';

/**
 * POST /api/cron/macro-refresh
 *
 * Refreshes curated macro series (Eurostat/ECB/INSEE) into MacroSeries/MacroPoint.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshMacroSeries();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// Allow GET for quick manual checks
export async function GET(req: NextRequest) {
  return POST(req);
}
