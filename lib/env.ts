/**
 * Environment variables validation with Zod
 * Ensures all required vars are present at runtime
 */

import { z } from 'zod';

const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),

  // Security / Auth
  // Required (no default). Use >= 32 chars.
  JWT_SECRET: z.string().min(32),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  
  // Academic APIs (optional keys, have fallback URLs)
  OPENALEX_API: z.string().url().optional().default("https://api.openalex.org/works"),
  THESESFR_API: z.string().url().optional().default("https://www.theses.fr/api/v1/theses"),
  CROSSREF_API: z.string().url().optional().default("https://api.crossref.org/works"),
  SEMANTICSCHOLAR_API: z.string().url().optional().default("https://api.semanticscholar.org/graph/v1/paper/search"),
  CORE_API_KEY: z.string().optional(),
  UNPAYWALL_EMAIL: z.string().email().optional(),
  
  // Identity enrichment
  ROR_API: z.string().url().optional().default("https://api.ror.org/organizations"),
  ORCID_API: z.string().url().optional().default("https://pub.orcid.org/v3.0"),
  
  // Macro data (official APIs)
  EUROSTAT_API: z.string().url().optional().default("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"),
  ECB_API: z.string().url().optional().default("https://data-api.ecb.europa.eu/service/data"),
  INSEE_API: z.string().url().optional().default("https://api.insee.fr/series/BDM/V1/data"),
  // Token for INSEE APIs (Melodi/BDM). Some INSEE endpoints require OAuth; we treat this as a bearer token.
  INSEE_API_KEY: z.string().optional(),
  
  // Cohere (for reranking)
  COHERE_API_KEY: z.string().optional(),
  
  // Anthropic (for Claude fallback)
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // Qwen (Alibaba Cloud / DashScope / Together.ai — OpenAI-compatible)
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().optional().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  QWEN_MODEL: z.string().optional().default("qwen-max"),
  
  // Admin
  ADMIN_KEY: z.string().optional(),
  
  // Redis (for caching & rate limiting)
  REDIS_URL: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().url().optional()
  ),
  
  // Upstash Redis (alternative to REDIS_URL)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  
  // Sentry (error tracking)
  SENTRY_DSN: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().url().optional()
  ),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  
  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_PROVIDER: z.string().optional().default("resend"),
  
  // Cron security
  CRON_SECRET: z.string().optional(),

  // Editorial cadence
  NOMOSX_WEEKLY_PUBLICATION_MAX: z.string().optional(),

  // Google Knowledge Graph (entity enrichment)
  GOOGLE_KNOWLEDGE_GRAPH_API_KEY: z.string().optional(),

  // Patents (optional)
  PATENTSVIEW_API_KEY: z.string().optional(),
  
  // Stripe (subscription payments — optional)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ACCESS: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),

  // Real-time economic data
  FRED_API_KEY: z.string().optional(), // Free at https://fred.stlouisfed.org/docs/api/api_key.html

  // News Intelligence (live event monitoring)
  NEWSAPI_KEY: z.string().optional(),

  // LinkUp (complementary web search — grey literature, think tanks, real-time web)
  LINKUP_API_KEY: z.string().optional(),

  // Next.js
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);

    // Hard requirements
    if (parsed.ADMIN_KEY && parsed.ADMIN_KEY.trim().length > 0) {
      // ok
    }

    // Production hard requirements
    if (parsed.NODE_ENV === "production") {
      if (!parsed.ADMIN_KEY || parsed.ADMIN_KEY.trim().length < 16) {
        throw new Error(
          "❌ Missing/weak ADMIN_KEY. In production you must set ADMIN_KEY (>= 16 chars)."
        );
      }
      if (!parsed.CRON_SECRET || parsed.CRON_SECRET.trim().length < 24) {
        throw new Error(
          "Missing/weak CRON_SECRET. In production you must set CRON_SECRET (>= 24 chars)."
        );
      }
      if (!parsed.REDIS_URL && !(parsed.UPSTASH_REDIS_REST_URL && parsed.UPSTASH_REDIS_REST_TOKEN)) {
        throw new Error(
          "Missing Redis configuration. In production set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed rate limiting."
        );
      }
      if (!parsed.NEXT_PUBLIC_APP_URL || parsed.NEXT_PUBLIC_APP_URL.includes("localhost")) {
        throw new Error(
          "Invalid NEXT_PUBLIC_APP_URL. In production it must be the public HTTPS application URL."
        );
      }
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(`❌ Invalid environment variables:\n${missing}`);
    }
    throw error;
  }
}

export const env = validateEnv();
