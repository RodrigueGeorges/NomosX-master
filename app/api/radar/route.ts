import { NextRequest,NextResponse } from 'next/server';
import { generateRadarCards } from '@/lib/agent/radar-agent';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await assertRateLimit(`radar:user:${user.id}`, 20, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const { searchParams } = new URL(req.url);
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 5;

    const cards = await generateRadarCards(limit);

    return NextResponse.json({ cards });
  } catch (error: any) {
    console.error("[API /radar] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate radar cards" },
      { status: 500 }
    );
  }
}
