/**
 * API Route: Create Analysis Run
 * 
 * Intégration avec le nouveau backend CTO-grade
 */

import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

const CreateAnalysisSchema = z.object({
  question: z.string().min(10).max(2000),
  mode: z.enum(["brief", "council"]),
  providers: z.array(z.string()).optional(),
  maxSources: z.number().int().min(5).max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const validated = CreateAnalysisSchema.parse(body);

    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/api/v1/analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": request.headers.get("x-correlation-id") || crypto.randomUUID(),
      },
      body: JSON.stringify(validated),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      run: data.run,
      message: "Analysis started successfully",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: "Validation error",
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
}
