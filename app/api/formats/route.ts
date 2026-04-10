/**
 * Formats API - Manage NomosX publication formats
 * Provides format templates, validation, and management
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateFormatTemplate, generateAllFormatTemplates } from '@/lib/generators/format-generator';
import { validateFormat, batchValidateFormat } from '@/lib/validators/format-validator';

// Zod schemas for validation
const formatQuerySchema = z.object({
  tier: z.enum(['FREE', 'PREMIUM', 'ENTERPRISE']).optional(),
  include: z.enum(['sections', 'templates', 'validation']).optional(),
});

const validateRequestSchema = z.object({
  content: z.string().min(100),
  formatId: z.number().int().positive(),
  options: z.object({
    tolerance: z.number().min(0).max(0.5).optional().default(0.1),
    strictMode: z.boolean().optional().default(false),
    includeSuggestions: z.boolean().optional().default(true),
    checkCitations: z.boolean().optional().default(false),
    checkMethodology: z.boolean().optional().default(false),
  }).optional()
});

const batchValidateRequestSchema = z.object({
  contents: z.array(z.object({
    id: z.string(),
    content: z.string().min(100),
    formatId: z.number().int().positive()
  })).min(1).max(10),
  options: z.object({
    tolerance: z.number().min(0).max(0.5).optional().default(0.1),
    strictMode: z.boolean().optional().default(false),
    includeSuggestions: z.boolean().optional().default(true),
  }).optional()
});

/**
 * GET /api/formats
 * Get all formats or specific format by tier
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = formatQuerySchema.parse(Object.fromEntries(searchParams));
    
    const includeSections = query.include === 'sections';
    const includeTemplates = query.include === 'templates';
    const includeValidation = query.include === 'validation';
    
    let formats;
    
    if (query.tier) {
      // Get formats by tier
      formats = await (prisma as any).publicationFormat?.findMany({
        where: { tier: query.tier },
        include: {
          sections: includeSections ? { orderBy: { orderIndex: 'asc' } } : false
        },
        orderBy: { tier: 'asc' }
      }) ?? [];
    } else {
      // Get all formats
      formats = await (prisma as any).publicationFormat?.findMany({
        include: {
          sections: includeSections ? { orderBy: { orderIndex: 'asc' } } : false
        },
        orderBy: { tier: 'asc' }
      }) ?? [];
    }
    
    // Generate templates if requested
    if (includeTemplates) {
      const templates = await generateAllFormatTemplates();
      
      // Merge templates with format data
      formats = (formats as any[]).map((format: any) => {
        const template = templates.find(t => t.id === format.id);
        return {
          ...format,
          template: template?.template,
          htmlTemplate: template?.htmlTemplate,
          validationRules: template?.validationRules
        };
      });
    }
    
    // Add validation rules if requested
    if (includeValidation && !includeTemplates) {
      formats = (formats as any[]).map((format: any) => ({
        ...format,
        validationRules: format.validationRules ? JSON.parse(format.validationRules as string) : null
      }));
    }
    
    return NextResponse.json({
      success: true,
      data: {
        formats,
        count: formats.length,
        tiers: ['FREE', 'PREMIUM', 'ENTERPRISE']
      }
    });
    
  } catch (error) {
    console.error('[Formats API] GET error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch formats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/formats/validate
 * Validate content against format specification
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, formatId, options } = validateRequestSchema.parse(body);
    
    // Validate content against format
    const validation = await validateFormat(content, formatId, options);
    
    return NextResponse.json({
      success: true,
      data: {
        validation,
        recommendations: validation.recommendations,
        compliance: validation.compliance,
        score: validation.overallScore
      }
    });
    
  } catch (error) {
    console.error('[Formats API] POST error:', error);
    
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
 * PUT /api/formats/batch-validate
 * Batch validate multiple contents
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { contents, options } = batchValidateRequestSchema.parse(body);
    
    // Batch validate contents
    const results = await batchValidateFormat(contents, options);
    
    // Calculate summary statistics
    const summary = {
      total: results.length,
      valid: results.filter(r => r.validation.isValid).length,
      partial: results.filter(r => r.validation.compliance === 'PARTIAL').length,
      failed: results.filter(r => r.validation.compliance === 'FAILED').length,
      avgScore: Math.round(results.reduce((sum, r) => sum + r.validation.overallScore, 0) / results.length)
    };
    
    return NextResponse.json({
      success: true,
      data: {
        results,
        summary,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Formats API] PUT error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to batch validate contents' },
      { status: 500 }
    );
  }
}
