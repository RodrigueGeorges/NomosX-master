/**
 * IMF SDMX Provider (dataservices.imf.org)
 *
 * Goal:
 * - Provide a robust, non-scraping IMF provider that does NOT depend on imf.org / elibrary.imf.org pages
 *   (which are frequently protected / blocked).
 * - Use the official SDMX JSON service:
 *   https://dataservices.imf.org/REST/SDMX_JSON.svc/
 *
 * Important note:
 * - SDMX is NOT a full-text search engine. It exposes "dataflows" (datasets) and series/observations via keys.
 * - This provider implements a pragmatic "search" by querying the Dataflow catalog, scoring flows by keyword match,
 *   and returning the most relevant datasets as sources.
 * - If no match is found, it returns a curated set of core IMF datasets (so the provider stays operational).
 */

import { fetchFromProvider } from '../../../http-client';

const IMF_SDMX_BASE = "https://dataservices.imf.org/REST/SDMX_JSON.svc";

// Cache Dataflow catalog in-memory to avoid repeated large downloads
const DATAFLOW_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let dataflowCache: { fetchedAt: number; flows: any[] } | null = null;

function ensureArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickText(x: any): string {
  if (!x) return "";
  if (typeof x === "string") return x;

  // SDMX JSON often uses objects like: { "#text": "...", "@xml:lang": "en" }
  if (typeof x === "object") {
    if (typeof x["#text"] === "string") return x["#text"];
    if (typeof x["text"] === "string") return x["text"];
    if (typeof x["name"] === "string") return x["name"];
  }

  return "";
}

function pickEnglishName(nameField: any): string {
  // IMF SDMX sometimes returns Name as array of multilingual objects
  const arr = ensureArray(nameField);
  if (arr.length === 0) return pickText(nameField);

  const en = arr.find((n: any) => {
    const lang = n?.["@xml:lang"] || n?.["@lang"] || n?.lang;
    return typeof lang === "string" && lang.toLowerCase().startsWith("en");
  });
  if (en) return pickText(en);

  // fallback to first
  return pickText(arr[0]);
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(query: string): string[] {
  const q = normalize(query);
  if (!q) return [];
  return q.split(/\s+/).filter((t) => t.length >= 3);
}

function scoreFlow(flow: any, query: string, terms: string[]): number {
  const id = String(
    flow?.KeyFamilyRef?.["@id"] ??
      flow?.KeyFamilyRef?.id ??
      flow?.KeyFamilyRef ??
      flow?.["@id"] ??
      flow?.id ??
      ""
  );
  const name = pickEnglishName(flow?.Name ?? flow?.name);
  const desc = pickEnglishName(flow?.Description ?? flow?.description);

  const hay = normalize(`${id} ${name} ${desc}`);

  let score = 0;

  // direct keyword matches
  for (const t of terms) {
    if (hay.includes(t)) score += 10;
  }

  // Intent -> dataset boosts (heuristics)
  const qn = normalize(query);
  const boostMap: Array<{ ifAny: string[]; boostIds: string[]; boost: number }> = [
    // Macro & monetary
    { ifAny: ["inflation", "cpi", "price", "prices"], boostIds: ["IFS"], boost: 25 },
    { ifAny: ["exchange", "fx", "currency", "rate"], boostIds: ["IFS"], boost: 18 },
    { ifAny: ["interest", "policy rate"], boostIds: ["IFS"], boost: 18 },

    // GDP / outlook
    { ifAny: ["gdp", "growth", "forecast", "outlook"], boostIds: ["WEO"], boost: 25 },

    // Trade
    { ifAny: ["trade", "exports", "imports", "tariff"], boostIds: ["DOT"], boost: 22 },

    // Balance of Payments
    { ifAny: ["balance of payments", "bop", "current account"], boostIds: ["BOP"], boost: 22 },

    // Financial stability
    { ifAny: ["financial stability", "banking", "systemic"], boostIds: ["FSI"], boost: 20 },
  ];

  const idNorm = normalize(id);
  for (const rule of boostMap) {
    if (rule.ifAny.some((k) => qn.includes(normalize(k)))) {
      if (rule.boostIds.some((bid) => normalize(bid) === idNorm)) {
        score += rule.boost;
      }
    }
  }

  // small bonus if it looks like a core dataset
  const core = new Set(["IFS", "WEO", "DOT", "BOP", "FSI"]);
  if (core.has(id)) score += 2;

  return score;
}

async function fetchDataflows(): Promise<any[]> {
  if (dataflowCache && Date.now() - dataflowCache.fetchedAt < DATAFLOW_CACHE_TTL_MS) {
    return dataflowCache.flows;
  }

  const url = `${IMF_SDMX_BASE}/Dataflow`;

  try {
    const data = await fetchFromProvider<any>("imf-sdmx", url, {
      timeout: 45000,
      retries: 2,
      retryDelay: 1000,
      headers: {
        Accept: "application/json",
      },
    });

    const flows =
      data?.Structure?.Dataflows?.Dataflow ??
      data?.structure?.dataflows?.dataflow ??
      data?.Dataflows?.Dataflow ??
      data?.dataflows?.dataflow ??
      [];

    const arr = ensureArray(flows);
    dataflowCache = { fetchedAt: Date.now(), flows: arr };
    return arr;
  } catch (err: any) {
    console.warn(`[IMF-SDMX] Dataflow fetch failed: ${err?.message || String(err)}`);
    return [];
  }
}

function curatedFallbackFlows(): Array<{ id: string; name: string }> {
  // Core datasets that exist on IMF SDMX. We return them as "sources" even if the catalog fetch fails.
  // This keeps the provider operational (and helps monitoring/launch readiness).
  return [
    { id: "IFS", name: "International Financial Statistics" },
    { id: "WEO", name: "World Economic Outlook" },
    { id: "DOT", name: "Direction of Trade Statistics" },
    { id: "BOP", name: "Balance of Payments" },
    { id: "FSI", name: "Financial Soundness Indicators" },
  ];
}

/**
 * Search IMF SDMX catalog (Dataflow) and return matching datasets.
 */
export async function searchIMFSDMX(query: string, limit = 15): Promise<any[]> {
  const q = (query || "").trim();
  const terms = tokenize(q);

  const flows = await fetchDataflows();

  // If catalog is unreachable, return curated datasets (still valid SDMX endpoints)
  if (!flows.length) {
    const year = new Date().getFullYear();
    return curatedFallbackFlows().slice(0, limit).map((f) => ({
      id: `imf-sdmx:${f.id}`,
      provider: "imf",
      type: "dataset",
      title: `IMF SDMX — ${f.name}`,
      abstract: `IMF SDMX dataset (${f.id}). Catalog unavailable; returning curated core dataset.`,
      url: `${IMF_SDMX_BASE}/DataStructure/${encodeURIComponent(f.id)}`,
      pdfUrl: null,
      year,
      publishedDate: null,
      documentType: "dataset",
      issuer: "IMF",
      issuerType: "economic",
      classification: "public",
      language: "en",
      contentFormat: "json",
      oaStatus: "open",
      hasFullText: false,
      raw: { flowId: f.id, flowName: f.name, fallback: true },
    }));
  }

  // Score dataflows by match
  const scored = flows
    .map((flow: any) => {
      const flowId = String(
        flow?.KeyFamilyRef?.["@id"] ??
          flow?.KeyFamilyRef?.id ??
          flow?.KeyFamilyRef ??
          flow?.["@id"] ??
          flow?.id ??
          ""
      );
      return {
        flow,
        flowId,
        name: pickEnglishName(flow?.Name ?? flow?.name) || flowId,
        description: pickEnglishName(flow?.Description ?? flow?.description),
        score: scoreFlow(flow, q, terms),
      };
    })
    .filter((x) => x.flowId);

  scored.sort((a, b) => b.score - a.score);

  // If no match, return curated core flows (but enrich from the catalog if present)
  const selected = scored.filter((s) => s.score > 0).slice(0, limit);
  const final = selected.length
    ? selected
    : curatedFallbackFlows()
        .map((core) => {
          const found = scored.find((s) => s.flowId.toUpperCase() === core.id);
          return found || {
            flow: null,
            flowId: core.id,
            name: core.name,
            description: "",
            score: 0,
          };
        })
        .slice(0, limit);

  const year = new Date().getFullYear();
  return final.map((s: any) => ({
    id: `imf-sdmx:${s.flowId}`,
    provider: "imf",
    type: "dataset",
    title: `IMF SDMX — ${s.name}`,
    abstract:
      s.description?.trim() ||
      (q
        ? `IMF SDMX dataset (${s.flowId}) relevant to: "${q}".`
        : `IMF SDMX dataset (${s.flowId}).`),
    url: `${IMF_SDMX_BASE}/DataStructure/${encodeURIComponent(s.flowId)}`,
    pdfUrl: null,
    year,
    publishedDate: null,
    documentType: "dataset",
    issuer: "IMF",
    issuerType: "economic",
    classification: "public",
    language: "en",
    contentFormat: "json",
    oaStatus: "open",
    hasFullText: false,
    raw: {
      flowId: s.flowId,
      flowName: s.name,
      score: s.score,
      source: "imf-sdmx-dataflow",
      query: q,
    },
  }));
}
