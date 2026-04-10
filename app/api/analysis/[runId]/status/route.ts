/**
 * API Route: Get Analysis Run Status
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // P2 FIX: Next.js 15+ params is a Promise
    const { runId } = await params;

    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/api/v1/analysis/${runId}`, {
      headers: {
        "X-Correlation-Id": request.headers.get("x-correlation-id") || crypto.randomUUID(),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      run: data.run,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
}
