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

  // LLM providers
  PRIMARY_LLM_PROVIDER: z.enum(["deepseek", "openai", "anthropic"]).optional().default("deepseek"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-6-astra"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().optional().default("https://api.deepseek.com"),
  // Real model codes on api.deepseek.com: deepseek-chat (V3.x, fast) and
  // deepseek-reasoner (R1). The previous defaults (deepseek-flash/v4-pro)
  // do not exist on the public API.
  DEEPSEEK_MODEL_FAST: z.string().optional().default("deepseek-chat"),
  DEEPSEEK_MODEL_REASONING: z.string().optional().default("deepseek-reasoner"),

  // GLM-4.5/4.6 family (z.ai) — OpenAI-compatible, verified live 2026-09.
  GLM_API_KEY: z.string().optional(),
  GLM_BASE_URL: z.string().url().optional().default("https://api.z.ai/api/paas/v4"),
  GLM_MODEL: z.string().optional().default("glm-4.5"),
  GLM_MODEL_FAST: z.string().optional().default("glm-4.5-air"),
  
  // Academic APIs (optional keys, have fallback URLs)
  OPENALEX_API: z.string().url().optional().default("https://api.openalex.org/works"),
  OPENALEX_API_KEY: z.string().optional(),
  THESESFR_API: z.string().url().optional().default("https://theses.fr/api/v1"),
  CROSSREF_API: z.string().url().optional().default("https://api.crossref.org/works"),
  SEMANTICSCHOLAR_API: z.string().url().optional().default("https://api.semanticscholar.org/graph/v1/paper/search"),
  SEMANTICSCHOLAR_API_KEY: z.string().optional(),
  CORE_API_KEY: z.string().optional(),
  UNPAYWALL_EMAIL: z.string().email().optional(),

  // Heritage / cultural aggregator APIs (free keys)
  EUROPEANA_API_KEY: z.string().optional(),
  DPLA_API_KEY: z.string().optional(),

  // Preprints & open-science platforms
  OSF_API_KEY: z.string().optional(),
  
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
  
  // Kimi K3 (Moonshot AI) — OpenAI-compatible, 1M context, 128K output, $3/$15 per M
  MOONSHOT_API_KEY: z.string().optional(),
  MOONSHOT_BASE_URL: z.string().url().optional().default("https://api.moonshot.ai/v1"),
  KIMI_MODEL: z.string().optional().default("kimi-k3"),

  // Google Gemini 3.8 Flash — OpenAI-compatible endpoint, 1M context, $0.75/$3.75 per M
  GOOGLE_API_KEY: z.string().optional(),

  // Free-tier LLM safety net ("freepool" provider) — all optional, all
  // OpenAI-compatible. Activated only as LAST-resort fallback when paid
  // providers are suspended/exhausted. Dormant when no key is set.
  GROQ_API_KEY: z.string().optional(),          // 30 RPM / 14.4K req-day, no card
  CEREBRAS_API_KEY: z.string().optional(),      // ~30 RPM / 1M tokens-day, no card
  NVIDIA_API_KEY: z.string().optional(),        // build.nvidia.com ~40 RPM free
  OPENROUTER_API_KEY: z.string().optional(),    // :free models ~50 req-day
  MISTRAL_API_KEY: z.string().optional(),       // Experiment tier 1B tokens/month
  
  // Qwen (Alibaba Cloud / DashScope / Together.ai — OpenAI-compatible)
  
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

  // Foresight Engine
  NOMOSX_FORESIGHT_ENABLED: z.string().optional(),
  NOMOSX_FORESIGHT_MAX_COST_USD: z.string().optional(),
  NOMOSX_FORESIGHT_CHAT_RATE_LIMIT: z.string().optional(),
  NOMOSX_FORESIGHT_MIN_SEED_SOURCES: z.string().optional(),

  // Patents (optional)
  PATENTSVIEW_API_KEY: z.string().optional(),
  
  // Stripe (StudioX pay-per-commission — optional)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Real-time economic data
  FRED_API_KEY: z.string().optional(), // Free at https://fred.stlouisfed.org/docs/api/api_key.html
  UCDP_API_KEY: z.string().optional(), // Free registration at https://ucdpapi.pcr.uu.se/
  // ── National/international statistics APIs (all free) ──
  COMTRADE_API_KEY: z.string().optional(),  // https://comtradedeveloper.un.org/ (free tier)
  BLS_API_KEY: z.string().optional(),       // https://www.bls.gov/developers/ (free)
  CENSUS_API_KEY: z.string().optional(),    // https://api.census.gov/data/key_signup.html (free)
  ACLED_API_KEY: z.string().optional(),     // https://acleddata.com/register/ (free academic)
  ACLED_EMAIL: z.string().optional(),       // ACLED registered email
  UNHCR_API_KEY: z.string().optional(),     // https://api.unhcr.org/ (free)
  ESTAT_JP_APP_ID: z.string().optional(),   // https://www.e-stat.go.jp/api/ (free)
  KOSIS_API_KEY: z.string().optional(),     // https://kosis.kr/openapi/ (free)
  DATACOMMONS_API_KEY: z.string().optional(), // https://apikeys.datacommons.org/ (free)
  SEARXNG_URL: z.string().optional(),        // self-hosted instance (e.g. http://localhost:8080) — public fallback otherwise

  // News Intelligence (live event monitoring)
  NEWSAPI_KEY: z.string().optional(),
  NEWSDATA_API_KEY: z.string().optional(),

  // LinkUp (complementary web search — grey literature, think tanks, real-time web)
  LINKUP_API_KEY: z.string().optional(),

  // Editorial V2 — position-first pipeline
  EDITORIAL_V2: z.string().optional(),

  // INDEX agent — S2 author enrichment (h-index/citations). Off by default:
  // S2 /author/search is rate-limited (1 req/s) and fails ~95% (429/400),
  // adding minutes to the pipeline for marginal metadata value.
  INDEX_S2_AUTHOR_ENRICH: z.string().optional(),

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

    // Production runtime hard requirements (skip during next build — NODE_ENV=production but no server yet)
    const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
    if (parsed.NODE_ENV === "production" && !isNextBuild) {
      if (!parsed.DEEPSEEK_API_KEY && !parsed.OPENAI_API_KEY && !parsed.ANTHROPIC_API_KEY) {
        throw new Error(
          "Missing LLM provider. In production set DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
        );
      }
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
        console.warn(
          "⚠️ No Redis configured. Using in-memory caching (rate limiting will be per-instance only). In production set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed rate limiting."
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
