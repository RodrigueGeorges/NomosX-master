
import { NextResponse } from 'next/server';
import { hybridSearch } from '@/lib/embeddings';
import { getSession } from '@/lib/auth';
import { assertRateLimit,RateLimitError } from '@/lib/security/rate-limit';

export async function GET(req: Request) {
  // Auth (P0): prevent public embedding-cost abuse
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit (P0)
  try {
    assertRateLimit(`search:user:${user.id}`, 60, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) } }
      );
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const provider = searchParams.get("provider");
  const minYear = searchParams.get("minYear");
  const domainsParam = searchParams.get("domains") || "";
  const domainSlugs = domainsParam ? domainsParam.split(",").filter(Boolean) : [];
  
  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = await hybridSearch(q, {
      limit: 36,
      lexicalLimit: 100,
      providers: provider ? [provider] : undefined,
      minYear: minYear ? parseInt(minYear) : undefined,
      domainSlugs: domainSlugs.length > 0 ? domainSlugs : undefined,
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.year,
        qualityScore: r.qualityScore,
        noveltyScore: r.noveltyScore,
        authors: r.authors?.map((sa: any) => sa.author?.name).filter(Boolean) || [],
        provider: r.provider,
        abstract: r.abstract?.slice(0, 200) || null,
        topics: r.topics || [],
        domains: r.domains?.map((sd: any) => ({
          slug: sd.domain?.slug,
          name: sd.domain?.name,
          icon: sd.domain?.icon,
          color: sd.domain?.color,
          score: sd.score,
        })) || [],
      })),
    });
  } catch (error: any) {
    console.error(`[Search API] Failed: ${error.message}`);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
