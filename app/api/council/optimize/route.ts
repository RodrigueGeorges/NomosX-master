/**
 * API Route: Council Optimization
 * 
 * Provides intelligent expert selection and load balancing
 * Used by pipeline to optimize 22 expert council performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { councilManager, CouncilQuery, CouncilSelection } from '@/lib/council/council-manager';
import { getSession } from '@/lib/auth';

/**
 * POST /api/council/optimize
 * 
 * Body: CouncilQuery
 * Returns: CouncilSelection with optimal expert configuration
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const user = await getSession();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    
    // Parse request body
    const query: CouncilQuery = await req.json();
    
    // Validate required parameters
    if (!query.question) {
      return NextResponse.json(
        { error: "Question parameter is required" },
        { status: 400 }
      );
    }
    
    if (!query.sourceContext) {
      return NextResponse.json(
        { error: "Source context parameter is required" },
        { status: 400 }
      );
    }
    
    // Get optimal expert selection
    const selection = await councilManager.selectOptimalExperts(query);
    
    return NextResponse.json({
      success: true,
      data: selection,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[COUNCIL_OPTIMIZE] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/council/optimize
 * 
 * Query parameters:
 * - question: string (required)
 * - sourceCount: number (optional, default 10)
 * - maxExperts: number (optional)
 * - strategic: boolean (optional)
 * - complexity: 'low' | 'medium' | 'high' (optional)
 * - priority: 'speed' | 'quality' | 'balanced' (optional)
 * 
 * Returns: CouncilSelection with optimal expert configuration
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const user = await getSession();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    
    // Parse query parameters
    const url = new URL(req.url);
    const question = url.searchParams.get("question");
    const sourceCount = url.searchParams.get("sourceCount") 
      ? parseInt(url.searchParams.get("sourceCount")!) 
      : 10;
    const maxExperts = url.searchParams.get("maxExperts") 
      ? parseInt(url.searchParams.get("maxExperts")!) 
      : undefined;
    const strategic = url.searchParams.get("strategic") === "true";
    const complexity = url.searchParams.get("complexity") as any;
    const priority = url.searchParams.get("priority") as any;
    
    // Validate required parameters
    if (!question) {
      return NextResponse.json(
        { error: "Question parameter is required" },
        { status: 400 }
      );
    }
    
    // Build council query
    const query: CouncilQuery = {
      question,
      sourceContext: "Generated from query parameters", // Placeholder
      sourceCount,
      options: {
        maxExperts,
        strategic,
        complexity,
        priority
      }
    };
    
    // Get optimal expert selection
    const selection = await councilManager.selectOptimalExperts(query);
    
    return NextResponse.json({
      success: true,
      data: selection,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[COUNCIL_OPTIMIZE] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
