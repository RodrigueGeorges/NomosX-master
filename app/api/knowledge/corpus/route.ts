/**
 * API Route: Knowledge Base Corpus Access
 * 
 * Provides access to the multi-domain knowledge base
 * Used by experts for context priming and research
 */

import { NextRequest, NextResponse } from 'next/server';
import { knowledgeBase, KnowledgeQuery } from '@/lib/knowledge/multi-domain-corpus';
import { getSession } from '@/lib/auth';

/**
 * GET /api/knowledge/corpus
 * 
 * Query parameters:
 * - domain: DomainExpertise (required)
 * - subDomain: string (optional)
 * - concept: string (optional)
 * - author: string (optional)
 * - yearRange: "2020-2023" (optional)
 * - documentType: "textbook" | "research-paper" | "report" | "framework" | "guideline" | "reference" (optional)
 * - minQualityScore: number (optional)
 * - limit: number (optional, default 10)
 * 
 * Returns: KnowledgeResult with documents matching criteria
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
    const domain = url.searchParams.get("domain") as any;
    const subDomain = url.searchParams.get("subDomain") || undefined;
    const concept = url.searchParams.get("concept") || undefined;
    const author = url.searchParams.get("author") || undefined;
    const yearRangeParam = url.searchParams.get("yearRange");
    const documentType = url.searchParams.get("documentType") as any;
    const minQualityScoreParam = url.searchParams.get("minQualityScore");
    const limitParam = url.searchParams.get("limit");
    
    // Validate required parameters
    if (!domain) {
      return NextResponse.json(
        { error: "Domain parameter is required" },
        { status: 400 }
      );
    }
    
    // Parse optional parameters
    let yearRange: [number, number] | undefined;
    if (yearRangeParam) {
      const [start, end] = yearRangeParam.split("-").map(Number);
      if (start && end && start <= end) {
        yearRange = [start, end];
      }
    }
    
    const minQualityScore = minQualityScoreParam ? parseInt(minQualityScoreParam) : undefined;
    const limit = limitParam ? parseInt(limitParam) : 10;
    
    // Build knowledge query
    const query: KnowledgeQuery = {
      domain,
      subDomain,
      concept,
      author,
      yearRange,
      documentType,
      minQualityScore,
      limit
    };
    
    // Search knowledge base
    const result = await knowledgeBase.search(query);
    
    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[KNOWLEDGE_CORPUS] Error:', error);
    
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
 * POST /api/knowledge/corpus
 * 
 * Body: KnowledgeQuery
 * Returns: KnowledgeResult with documents matching criteria
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
    const query: KnowledgeQuery = await req.json();
    
    // Validate required parameters
    if (!query.domain) {
      return NextResponse.json(
        { error: "Domain parameter is required" },
        { status: 400 }
      );
    }
    
    // Search knowledge base
    const result = await knowledgeBase.search(query);
    
    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[KNOWLEDGE_CORPUS] Error:', error);
    
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
