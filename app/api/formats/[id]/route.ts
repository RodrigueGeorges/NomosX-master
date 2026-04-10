/**
 * Individual Format API - Manage specific NomosX publication format
 * Provides format details, templates, and validation for individual formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateFormatTemplate } from '@/lib/generators/format-generator';
import { validateFormat } from '@/lib/validators/format-validator';

// Zod schema for validation
const validateRequestSchema = z.object({
  content: z.string().min(100),
  options: z.object({
    tolerance: z.number().min(0).max(0.5).optional().default(0.1),
    strictMode: z.boolean().optional().default(false),
    includeSuggestions: z.boolean().optional().default(true),
    checkCitations: z.boolean().optional().default(false),
    checkMethodology: z.boolean().optional().default(false),
  }).optional()
});

/**
 * GET /api/formats/[id]
 * Get specific format by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formatId = parseInt(id);
    
    if (isNaN(formatId) || formatId <= 0) {
      return NextResponse.json(
        { error: 'Invalid format ID' },
        { status: 400 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const include = searchParams.get('include');
    
    // Format table doesn't exist yet, return placeholder
    const format = {
      id: formatId,
      name: "Format " + formatId,
      tier: "STANDARD",
      totalWords: 1000,
      lawzeroInspired: false,
      validationRules: null,
      sections: []
    };
    
    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }
    
    let response = {
      success: true,
      data: {
        format: {
          id: format.id,
          name: format.name,
          tier: format.tier,
          totalWords: format.totalWords,
          lawzeroInspired: format.lawzeroInspired,
          validationRules: format.validationRules ? JSON.parse(format.validationRules as string) : null,
          sections: format.sections.map((section: any) => ({
            id: section.id,
            name: section.name,
            wordTarget: section.wordTarget,
            percentage: section.percentageTarget,
            content: section.contentDescription,
            required: section.isRequired,
            orderIndex: section.orderIndex
          }))
        }
      }
    };
    
    // Include template if requested
    if (include === 'template') {
      // Template generation would go here - for now return placeholder
      (response.data.format as any).template = "Template not implemented yet";
      (response.data.format as any).htmlTemplate = "<p>HTML template not implemented yet</p>";
    }
    
    // Include statistics if requested
    if (include === 'stats') {
      // Statistics would go here - for now return placeholder
      (response.data.format as any).stats = {
        totalPublications: 0,
        averageWordCount: 0,
        usageCount: 0
      };
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[Format API] GET error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch format' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/formats/[id]/validate
 * Validate content against specific format
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formatId = parseInt(id);
    
    if (isNaN(formatId) || formatId <= 0) {
      return NextResponse.json(
        { error: 'Invalid format ID' },
        { status: 400 }
      );
    }
    
    // Format table doesn't exist yet, return placeholder
    const format = {
      id: formatId,
      name: "Format " + formatId,
      tier: "STANDARD",
      totalWords: 1000,
      lawzeroInspired: false,
      validationRules: null,
      sections: []
    };
    
    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }
    
    const body = await req.json();
    const { content, options } = validateRequestSchema.parse(body);
    
    // Validate content against format
    const validation = await validateFormat(content, formatId, options);
    
    return NextResponse.json({
      success: true,
      data: {
        format: {
          id: format.id,
          name: format.name,
          tier: format.tier,
          totalWords: format.totalWords
        },
        validation,
        recommendations: validation.recommendations,
        compliance: validation.compliance,
        score: validation.overallScore,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Format API] POST error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to validate content' },
      { status: 500 }
    );
  }
}

/**
 * Get format statistics
 */
async function getFormatStatistics(formatId: number) {
  try {
    // These tables don't exist yet, return placeholder data
    const stats = [];
    const totalPublications = 0;
    
    // These tables don't exist yet, return placeholder data
    const avgWordCount = { _avg: { wordCountActual: 0 } };
    
    const recentPublications = 0;
    
    return {
      totalPublications,
      complianceBreakdown: { NONE: 0 },
      averageWordCount: avgWordCount._avg.wordCountActual || 0,
      recentPublications,
      lastUpdated: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error getting format statistics:', error);
    return {
      totalPublications: 0,
      complianceBreakdown: {},
      averageWordCount: 0,
      recentPublications: 0,
      complianceRate: 0
    };
  }
}
