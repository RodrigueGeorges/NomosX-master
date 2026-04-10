/**
 * AGENTS VALIDATION V2 - Zod Schemas
 * Schémas de validation robustes pour tous les agents
 */

import { z } from 'zod';

// ==========================================
// READING RESULT SCHEMA (Unified)
// ==========================================

export const ReadingResultSchema = z.object({
  sourceId: z.string(),
  claims: z.array(z.string()).max(3),
  methods: z.array(z.string()).max(3),
  results: z.array(z.string()).max(3),
  limitations: z.array(z.string()).max(2),
  confidence: z.enum(['high', 'medium', 'low']),
  extractionMode: z.enum(['llm', 'rules', 'skipped']).default('llm'),
  processedAt: z.string().datetime().optional(),
  processingTime: z.number().optional()
});

export type ReadingResult = z.infer<typeof ReadingResultSchema>;

// ==========================================
// ANALYST OUTPUT SCHEMA
// ==========================================

export const AnalysisOutputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(50),
  consensus: z.string().min(10),
  disagreements: z.string().optional(),
  debate: z.object({
    pro: z.string().min(10),
    con: z.string().min(10),
    synthesis: z.string().min(20)
  }),
  evidence: z.string().min(10),
  implications: z.string().min(10),
  risks: z.string().optional(),
  openQuestions: z.string().optional(),
  whatChangesMind: z.string().optional(),
  sources: z.array(z.string()).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  processingTime: z.number().optional(),
  tokenCount: z.number().optional()
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

// ==========================================
// STRATEGIC ANALYSIS OUTPUT SCHEMA
// ==========================================

export const StrategicAnalysisOutputSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string().min(500),
  keyFindings: z.array(z.string()).max(10),
  urgencyLevel: z.enum(['critical', 'high', 'medium', 'low']),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  
  literatureOverview: z.string().min(800),
  theoreticalFrameworks: z.string().optional(),
  methodologicalApproaches: z.string().optional(),
  keyStudies: z.array(z.object({
    citation: z.string(),
    contribution: z.string(),
    limitations: z.string()
  })).max(20),
  
  themes: z.array(z.object({
    name: z.string(),
    description: z.string(),
    evidence: z.string(),
    sources: z.array(z.string())
  })).max(15),
  
  consensus: z.string(),
  controversies: z.string(),
  emergingTrends: z.string(),
  
  debate: z.object({
    position1: z.object({
      label: z.string(),
      arguments: z.string(),
      evidence: z.string(),
      proponents: z.string()
    }),
    position2: z.object({
      label: z.string(),
      arguments: z.string(),
      evidence: z.string(),
      proponents: z.string()
    }),
    synthesis: z.string(),
    nuances: z.string()
  }),
  
  evidenceQuality: z.object({
    overallScore: z.number().min(1).max(10),
    methodology: z.string(),
    sampleSizes: z.string(),
    replication: z.string(),
    biases: z.string(),
    gaps: z.string()
  }),
  
  stakeholderAnalysis: z.array(z.object({
    stakeholder: z.string(),
    impact: z.string(),
    magnitude: z.enum(['low', 'medium', 'high', 'critical']),
    details: z.string()
  })).max(20),
  
  scenarios: z.array(z.object({
    name: z.string(),
    probability: z.number().min(0).max(1),
    description: z.string(),
    implications: z.string(),
    signals: z.array(z.string())
  })).max(8),
  
  recommendations: z.object({
    immediate: z.array(z.string()).max(10),
    shortTerm: z.array(z.string()).max(10),
    longTerm: z.array(z.string()).max(10),
    riskMitigation: z.array(z.string()).max(10)
  }),
  
  implementation: z.object({
    prerequisites: z.array(z.string()).max(15),
    timeline: z.string(),
    resources: z.string(),
    metrics: z.array(z.string()).max(10),
    obstacles: z.array(z.string()).max(10)
  }),
  
  conclusion: z.string().min(200),
  openQuestions: z.array(z.string()).max(15),
  whatChangesMind: z.string().optional(),
  
  processingTime: z.number().optional(),
  tokenCount: z.number().optional(),
  modelUsed: z.string().optional()
});

export type StrategicAnalysisOutput = z.infer<typeof StrategicAnalysisOutputSchema>;

// ==========================================
// VALIDATION HELPERS
// ==========================================

/**
 * Validate and repair LLM JSON output
 */
export function validateAndRepairJSON(jsonString: string, schema: z.ZodSchema): {
  success: boolean;
  data?: any;
  error?: string;
  repaired?: boolean;
} {
  try {
    // First attempt: direct parse
    const parsed = JSON.parse(jsonString);
    const validated = schema.parse(parsed);
    
    return { success: true, data: validated, repaired: false };
  } catch (error: any) {
    try {
      // Second attempt: repair common JSON issues
      let repaired = jsonString
        .replace(/,\s*}/g, '}')  // Remove trailing commas
        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
        .replace(/(\w+):/g, '"$1":')  // Quote unquoted property names
        .replace(/'/g, '"');  // Replace single quotes with double quotes
      
      const parsed = JSON.parse(repaired);
      const validated = schema.parse(parsed);
      
      return { success: true, data: validated, repaired: true };
    } catch (repairError: any) {
      return { 
        success: false, 
        error: `Original: ${error.message}. Repair: ${repairError.message}` 
      };
    }
  }
}

/**
 * Safe LLM response parsing with fallback
 */
export async function safeLLMParse<T>(
  response: string,
  schema: z.ZodSchema,
  fallback?: Partial<T>
): Promise<{
  success: boolean;
  data?: T;
  error?: string;
  usedFallback: boolean;
}> {
  const validation = validateAndRepairJSON(response, schema);
  
  if (validation.success && validation.data) {
    return {
      success: true,
      data: validation.data,
      usedFallback: false
    };
  }
  
  // Return fallback if provided
  if (fallback) {
    return {
      success: false,
      data: fallback as T,
      error: validation.error,
      usedFallback: true
    };
  }
  
  return {
    success: false,
    error: validation.error,
    usedFallback: false
  };
}

/**
 * Batch validation for multiple results
 */
export function validateBatch<T>(
  items: any[],
  schema: z.ZodSchema
): {
  valid: T[];
  invalid: Array<{ item: any; error: string }>;
  stats: { total: number; valid: number; invalid: number; validityRate: number };
} {
  const valid: T[] = [];
  const invalid: Array<{ item: any; error: string }> = [];
  
  for (const item of items) {
    try {
      const validated = schema.parse(item);
      valid.push(validated);
    } catch (error: any) {
      invalid.push({ item, error: error.message });
    }
  }
  
  const total = items.length;
  const validityRate = total > 0 ? valid.length / total : 0;
  
  return {
    valid,
    invalid,
    stats: { total, valid: valid.length, invalid: invalid.length, validityRate }
  };
}
