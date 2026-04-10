
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import OpenAI from 'openai';
import { selectSmartProviders } from '@/lib/agent/smart-provider-selector';
import { scout } from '@/lib/agent/pipeline-v2';
import { indexAgent } from '@/lib/agent/index-agent';
import { rank } from '@/lib/agent/pipeline-v2';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { z } from 'zod';

const councilAskSchema = z.object({
  question: z.string().min(3, 'Question too short').max(2000, 'Question too long'),
});

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: max 10 council asks per minute per user
  try {
    await assertRateLimit(`council-ask:user:${session.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
      );
    }
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const validation = councilAskSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.errors },
      { status: 400 }
    );
  }
  const q = validation.data.question.trim();

  // ✅ PIPELINE INTELLIGENT : Scout → Index → Rank (comme Brief)
  const smartSelection = await selectSmartProviders(q).catch(() => null);
  const scoutProviders = (smartSelection?.providers ?? ["openalex", "crossref", "semanticscholar"]) as any;
  const scoutQty = smartSelection?.quantity ?? 30;

  // Scout : Collecter sources pertinentes
  const scoutResult = await scout(q, scoutProviders, scoutQty);
  
  // Handle both cached array and fresh result object
  const sourceIds = Array.isArray(scoutResult) ? scoutResult.map(s => s.id) : (scoutResult.sourceIds || []);
  
  // Index : Enrichir les sources
  if (sourceIds.length > 0) {
    await indexAgent(sourceIds);
  }
  
  // Rank : Sélectionner top 12 sources par qualité
  const sources = await rank(q, { limit: 12, mode: "quality", sourceIds });
  
  const ctx = sources.map((s, i) => 
    `[SRC-${i + 1}] ${s.title} (${s.year ?? "n.d."}) :: ${(s.abstract || "No abstract").slice(0, 800)}`
  ).join("\n\n");

  const prompt = `You are NomosX Council Agent — a multi-perspective think tank system.

Your mission: Analyze the question from 4 TRULY DISTINCT perspectives (economic, technical, ethical, political) anchored in research.

**4 PERSPECTIVES (CRITICAL - MUST BE DIFFERENT):**

1. **ECONOMIC** 💰
   - Focus: ROI, costs, benefits, market impacts, economic efficiency, incentives
   - Analyze: Who pays? Who benefits? Economic sustainability? Market effects?
   - Cite research on economic data, cost-benefit analyses, market studies

2. **TECHNICAL** ⚙️
   - Focus: Feasibility, infrastructure, implementation, technical requirements, scalability
   - Analyze: Is it technically possible? What infrastructure needed? Technical risks?
   - Cite research on technical implementations, engineering studies, technical constraints

3. **ETHICAL** ❤️
   - Focus: Consent, fairness, justice, bias, social impacts, equity
   - Analyze: Who is affected? Is it fair? Privacy concerns? Social justice implications?
   - Cite research on social impacts, equity studies, ethical frameworks

4. **POLITICAL** 🏛️
   - Focus: Regulation, governance, sovereignty, geopolitics, policy feasibility
   - Analyze: What regulations needed? Political resistance? Geopolitical impacts?
   - Cite research on policy, governance, regulatory frameworks, political feasibility

**CRITICAL RULES:**
1. ALWAYS cite sources using [SRC-1], [SRC-2], etc. (minimum 3 citations per perspective)
2. Each perspective must be 2-3 paragraphs (150-200 words)
3. Perspectives MUST BE DISTINCT — no overlap in content or angle
4. Be specific, nuanced, and grounded in evidence
5. Identify tensions and trade-offs BETWEEN perspectives
6. Synthesis must integrate all 4 perspectives with strategic recommendations (250-300 words)

**OUTPUT FORMAT (strict JSON):**
{
  "economic": "Economic perspective focusing on ROI, costs, benefits, market impacts [SRC-*]...",
  "technical": "Technical perspective focusing on feasibility, infrastructure [SRC-*]...",
  "ethical": "Ethical perspective focusing on fairness, consent, justice [SRC-*]...",
  "political": "Political perspective focusing on regulation, governance [SRC-*]...",
  "synthesis": "Integrated synthesis addressing tensions between perspectives and strategic recommendations...",
  "uncertainty": "Key uncertainties, missing data, and what would change our analysis..."
}

**QUESTION:** ${q}

**SOURCES:**
${ctx}

Generate the 4 DISTINCT perspective analysis now.`;

  const r = await ai.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const txt = r.choices[0].message.content || "{}";
  let out: any = {};
  try { 
    out = JSON.parse(txt); 
  } catch (e) {
    console.error("Council JSON parse error:", e);
    out = {};
  }

  // Format output with line breaks for readability
  const formatText = (text: string) => String(text || "Analyse non disponible").replace(/\n\n/g, "<br/><br/>");

  return NextResponse.json({
    economic: formatText(out.economic),
    technical: formatText(out.technical),
    ethical: formatText(out.ethical),
    political: formatText(out.political),
    synthesis: formatText(out.synthesis),
    uncertainty: String(out.uncertainty || "Données insuffisantes pour évaluer les incertitudes."),
    sources: sources.map((s, i) => ({ 
      id: s.id,
      num: i + 1,
      title: s.title,
      year: s.year,
      provider: s.provider 
    }))
  });
}
