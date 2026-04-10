/**
 * OECD SDMX Provider (sdmx.oecd.org)
 *
 * Why:
 * - oecd.org and oecd-ilibrary.org are frequently protected (Cloudflare), causing 403s.
 * - OECD operates an SDMX REST endpoint on a separate domain:
 *   https://sdmx.oecd.org/public/rest
 *   (Disseminate Final DMZ / external access)
 *
 * What this provider returns:
 * - SDMX is a data API, not a publications search engine.
 * - We implement a pragmatic "search" by pulling the Dataflow catalog and scoring by keyword match.
 * - Returned items are treated as "dataset" sources in NomosX.
 */

import { fetchFromProvider } from '../../../http-client';

const OECD_SDMX_BASE = "https://sdmx.oecd.org/public/rest";

// Dataflow catalog is large; cache in-memory
const DATAFLOW_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let dataflowCache: { fetchedAt: number; flows: any[] } | null = null;

function ensureArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
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

function getName(flow: any): string {
  // API returns: name: "..." or name: { en: "..." }
  const name = flow?.name;
  if (!name) return "";
  if (typeof name === "string") return name;
  if (typeof name === "object") {
    // pick english if available
    if (typeof name.en === "string") return name.en;
    const first = Object.values(name)[0];
    if (typeof first === "string") return first;
  }
  return "";
}

function scoreFlow(flow: any, query: string, terms: string[]): number {
  const id = String(flow?.id || "");
  const agency = String(flow?.agencyID || "");
  const version = String(flow?.version || "");
  const name = getName(flow);

  const hay = normalize(`${agency} ${id} ${version} ${name}`);

  let score = 0;
  for (const t of terms) {
    if (hay.includes(t)) score += 10;
  }

  // Light boosts for common economic intents
  const qn = normalize(query);
  const boosts: Array<{ ifAny: string[]; boostIfId: RegExp; boost: number }> = [
    { ifAny: ["inflation", "cpi", "prices"], boostIfId: /cpi|price/i, boost: 10 },
    { ifAny: ["gdp", "growth"], boostIfId: /gdp|na|qna|sna/i, boost: 10 },
    { ifAny: ["employment", "unemployment", "labour", "labor"], boostIfId: /lfs|une|emp|lab/i, boost: 8 },
    { ifAny: ["trade", "exports", "imports"], boostIfId: /trade|dot|itcs/i, boost: 8 },
  ];

  for (const b of boosts) {
    if (b.ifAny.some((k) => qn.includes(normalize(k)))) {
      if (b.boostIfId.test(id) || b.boostIfId.test(name)) score += b.boost;
    }
  }

  return score;
}

async function fetchDataflows(): Promise<any[]> {
  if (dataflowCache && Date.now() - dataflowCache.fetchedAt < DATAFLOW_CACHE_TTL_MS) {
    return dataflowCache.flows;
  }

  const url = `${OECD_SDMX_BASE}/dataflow`;

  try {
    // The endpoint supports SDMX structure JSON version 1.0
    // (version 2.0 may cause server errors).
    const data = await fetchFromProvider<any>("oecd-sdmx", url, {
      timeout: 45000,
      retries: 2,
      retryDelay: 1000,
      headers: {
        Accept: "application/vnd.sdmx.structure+json;version=1.0, application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });

    // Observed shapes:
    // - { data: { dataflows: [ {id, agencyID, version, name, ...}, ...] } }
    // - or other wrappers (we guard)
    const flows =
      data?.data?.dataflows ??
      data?.dataflows ??
      data?.structure?.dataflows ??
      [];

    const arr = ensureArray(flows);
    dataflowCache = { fetchedAt: Date.now(), flows: arr };
    return arr;
  } catch (err: any) {
    console.warn(`[OECD-SDMX] Dataflow fetch failed: ${err?.message || String(err)}`);
    return [];
  }
}

function curatedFallbackFlows(): Array<{ agencyID: string; id: string; name: string }> {
  // If catalog fetch fails, still return a small set of canonical OECD datasets.
  // NOTE: IDs may vary across agencies; these are best-effort placeholders.
  return [
    { agencyID: "OECD", id: "DP_LIVE", name: "OECD Data - Key indicators" },
    { agencyID: "OECD", id: "MEI", name: "Main Economic Indicators" },
    { agencyID: "OECD", id: "QNA", name: "Quarterly National Accounts" },
    { agencyID: "OECD", id: "SNA_TABLE", name: "National Accounts" },
    { agencyID: "OECD", id: "LABOUR", name: "Labour statistics" },
  ];
}

function dataflowUrl(agencyID: string, id: string, version?: string | null): string {
  // SDMX REST resource format: /dataflow/{agencyID}/{resourceID}/{version}
  const v = version && String(version).trim() ? String(version).trim() : "all";
  return `${OECD_SDMX_BASE}/dataflow/${encodeURIComponent(agencyID)}/${encodeURIComponent(id)}/${encodeURIComponent(v)}`;
}

/**
 * Search OECD SDMX dataflows and map to NomosX "source" format.
 */
export async function searchOECDSDMX(query: string, limit = 15): Promise<any[]> {
  const q = (query || "").trim();
  const terms = tokenize(q);

  const flows = await fetchDataflows();

  // If catalog unreachable, return curated datasets
  if (!flows.length) {
    const year = new Date().getFullYear();
    return curatedFallbackFlows().slice(0, limit).map((f) => ({
      id: `oecd-sdmx:${f.agencyID}:${f.id}`,
      provider: "oecd",
      type: "dataset",
      title: `OECD SDMX — ${f.name}`,
      abstract: `OECD SDMX dataset (${f.id}). Catalog unavailable; returning curated dataset.`,
      url: dataflowUrl(f.agencyID, f.id, "all"),
      pdfUrl: null,
      year,
      publishedDate: null,
      documentType: "dataset",
      issuer: "OECD",
      issuerType: "economic",
      classification: "public",
      language: "en",
      contentFormat: "json",
      oaStatus: "open",
      hasFullText: false,
      raw: { agencyID: f.agencyID, flowId: f.id, flowName: f.name, fallback: true },
    }));
  }

  const scored = flows
    .map((flow: any) => {
      const id = String(flow?.id || "");
      const agencyID = String(flow?.agencyID || "");
      const version = String(flow?.version || "");
      const name = getName(flow) || id;
      return {
        flow,
        id,
        agencyID,
        version,
        name,
        score: scoreFlow(flow, q, terms),
      };
    })
    .filter((x) => x.id);

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.filter((s) => s.score > 0).slice(0, limit);

  const final = selected.length
    ? selected
    : scored.slice(0, Math.min(limit, 10)); // if no match, return a few recent/default

  const year = new Date().getFullYear();
  return final.map((s: any) => ({
    id: `oecd-sdmx:${s.agencyID}:${s.id}:${s.version || ""}`.replace(/:+$/g, ""),
    provider: "oecd",
    type: "dataset",
    title: `OECD SDMX — ${s.name}`,
    abstract: q ? `OECD SDMX dataset (${s.id}) relevant to: "${q}".` : `OECD SDMX dataset (${s.id}).`,
    url: dataflowUrl(s.agencyID, s.id, s.version || "all"),
    pdfUrl: null,
    year,
    publishedDate: null,
    documentType: "dataset",
    issuer: "OECD",
    issuerType: "economic",
    classification: "public",
    language: "en",
    contentFormat: "json",
    oaStatus: "open",
    hasFullText: false,
    raw: {
      source: "oecd-sdmx-dataflow",
      agencyID: s.agencyID,
      flowId: s.id,
      version: s.version,
      score: s.score,
      query: q,
    },
  }));
}
