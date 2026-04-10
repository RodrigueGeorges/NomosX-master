/**
 * Editorial Gate Batch API - Evaluate pending signals in batch
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { evaluatePendingSignals } from '@/lib/agent/editorial-gate';

// POST /api/editorial-gate/batch - Evaluate all pending signals
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role (batch operations should be restricted)
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required for batch operations" },
        { status: 403 }
      );
    }

    const result = await evaluatePendingSignals();

    return NextResponse.json({
      evaluated: result.evaluated,
      approved: result.approved,
      held: result.held,
      rejected: result.rejected,
      silenced: result.silenced,
    });
  } catch (error) {
    console.error("[API] POST /api/editorial-gate/batch error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate pending signals" },
      { status: 500 }
    );
  }
}
