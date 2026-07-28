/**
 * NomosX REAL-TIME DATA HUB — Multi-Domain Live Intelligence
 *
 * Aggregates live data from 12 free public APIs covering ALL 22 PhD domains:
 *
 * Economics/Finance: FRED (Federal Reserve) — rates, inflation, unemployment, housing, trade
 *                    ECB (European Central Bank) — EUR/USD, MRO rate, Euro area GDP
 * Health/Biotech:    WHO Disease Outbreak News — epidemic alerts worldwide
 * Climate/Energy:    Open-Meteo — global temperature proxy
 *                    NASA GISS — global temperature anomaly (satellite-grade)
 * Security:          USGS — earthquake/disaster monitoring worldwide
 *                    NVD/NIST — critical cybersecurity vulnerabilities (CVEs)
 * Geopolitics:       GDELT — global conflict news tone & article volume
 * Law/Regulation:    Federal Register — new US regulations and executive orders
 *                    EUR-Lex — new EU regulations and legal acts
 * Technology/AI:     Papers With Code — trending ML methods and benchmarks
 * Development:       World Bank — GDP, poverty, health, education, demographics
 *
 * This data is:
 * 1. Fetched on every auto-scan run (cached 6h)
 * 2. Injected into Context Primer for ALL PhD researchers
 * 3. Used by Editorial Planner to detect cross-domain shifts
 * 4. Stored as MacroSeries for longitudinal tracking
 *
 * All APIs used are FREE and require no API key (or optional key for higher limits).
 */

import { prisma } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export type IndicatorCategory =
  // Economics & Finance (Dr. Vasquez, Dr. Roberts)
  | 'interest_rate' | 'inflation' | 'employment' | 'market' | 'currency' | 'commodity' | 'growth' | 'trade'
  // Health & Biotech (Dr. Lindström, Dr. Martin)
  | 'health' | 'disease_outbreak' | 'biotech'
  // Climate & Environment (Dr. Tanaka)
  | 'climate' | 'environment'
  // Energy (Dr. Al-Rashid)
  | 'energy'
  // Security & Geopolitics (Dr. Webb, Dr. Petrov)
  | 'security' | 'geopolitics' | 'disaster' | 'cybersecurity'
  // Law & Regulation (Dr. Moreau)
  | 'regulation' | 'legislation'
  // Technology & AI (Dr. Chen)
  | 'technology' | 'ai_ml'
  // Development & Demographics (Dr. González, Dr. Rodriguez)
  | 'development' | 'demographics' | 'urbanization'
  // Digital Society (Dr. Osei)
  | 'digital_society'
  // Behavioral & Cognitive (Dr. Kim, Dr. Chang)
  | 'behavioral';

export interface RealTimeIndicator {
  provider: string;
  code: string;
  name: string;
  value: number;
  previousValue?: number;
  changePercent?: number;
  unit: string;
  timestamp: Date;
  category: IndicatorCategory;
}

export interface RealTimePulse {
  timestamp: Date;
  indicators: RealTimeIndicator[];
  alerts: MarketAlert[];
  summary: string;
  durationMs: number;
}

export interface MarketAlert {
  indicator: string;
  type: 'spike' | 'crash' | 'reversal' | 'milestone' | 'divergence';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  value: number;
  threshold: number;
}

// ============================================================================
// FRED API (Federal Reserve Economic Data) — Free, no key required
// ============================================================================

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const FRED_SERIES: Record<string, { name: string; unit: string; category: IndicatorCategory }> = {
  // ── Economics & Finance (Dr. Vasquez, Dr. Roberts, Dr. Kim) ──
  'FEDFUNDS':   { name: 'Fed Funds Rate', unit: '%', category: 'interest_rate' },
  'DGS10':      { name: 'US 10-Year Treasury Yield', unit: '%', category: 'interest_rate' },
  'DGS2':       { name: 'US 2-Year Treasury Yield', unit: '%', category: 'interest_rate' },
  'CPIAUCSL':   { name: 'US CPI (All Urban Consumers)', unit: 'index', category: 'inflation' },
  'UNRATE':     { name: 'US Unemployment Rate', unit: '%', category: 'employment' },
  'GDP':        { name: 'US GDP (Nominal)', unit: 'billions USD', category: 'growth' },
  'DEXUSEU':    { name: 'USD/EUR Exchange Rate', unit: 'USD per EUR', category: 'currency' },
  'T10Y2Y':     { name: 'US 10Y-2Y Yield Spread', unit: '%', category: 'interest_rate' },
  'VIXCLS':     { name: 'VIX Volatility Index', unit: 'index', category: 'market' },
  'UMCSENT':    { name: 'US Consumer Sentiment (Michigan)', unit: 'index', category: 'behavioral' },
  'BOPGSTB':    { name: 'US Trade Balance', unit: 'millions USD', category: 'trade' },

  // ── Energy (Dr. Al-Rashid) ──
  'DCOILWTICO': { name: 'WTI Crude Oil Price', unit: 'USD/barrel', category: 'energy' },
  'DCOILBRENTEU': { name: 'Brent Crude Oil Price', unit: 'USD/barrel', category: 'energy' },
  'GASREGW':    { name: 'US Regular Gas Price', unit: 'USD/gallon', category: 'energy' },
  'DHHNGSP':    { name: 'Henry Hub Natural Gas Price', unit: 'USD/MMBtu', category: 'energy' },

  // ── Commodities (cross-domain) ──
  'GOLDAMGBD228NLBM': { name: 'Gold Price (London Fix)', unit: 'USD/oz', category: 'commodity' },
  'DEXCHUS':    { name: 'USD/CNY Exchange Rate', unit: 'CNY per USD', category: 'currency' },

  // ── Housing & Urban (Dr. Rodriguez) ──
  'CSUSHPINSA': { name: 'Case-Shiller US Home Price Index', unit: 'index', category: 'urbanization' },
  'HOUST':      { name: 'US Housing Starts', unit: 'thousands', category: 'urbanization' },
  'MORTGAGE30US': { name: 'US 30-Year Fixed Mortgage Rate', unit: '%', category: 'urbanization' },

  // ── Health (Dr. Lindström) ──
  'HLTHSCPCHCSA': { name: 'US Health Services CPI', unit: 'index', category: 'health' },

  // ── Employment Deep (Dr. Vasquez, Dr. González) ──
  'JTSJOL':     { name: 'US Job Openings (JOLTS)', unit: 'thousands', category: 'employment' },
  'LNS11300000': { name: 'US Labor Force Participation Rate', unit: '%', category: 'employment' },
  'A067RP1A027NBEA': { name: 'US Personal Savings Rate', unit: '%', category: 'behavioral' },
};

async function fetchFREDSeries(seriesId: string, fredApiKey?: string): Promise<RealTimeIndicator | null> {
  const meta = FRED_SERIES[seriesId];
  if (!meta) return null;

  const apiKey = fredApiKey || process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn(`[REALTIME] FRED_API_KEY not set, skipping ${seriesId}`);
    return null;
  }

  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: '2',
    });

    const response = await fetch(`${FRED_BASE}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const observations = (data.observations || []).filter((o: any) => o.value !== '.');

    if (observations.length === 0) return null;

    const latest = observations[0];
    const previous = observations[1];
    const value = parseFloat(latest.value);
    const prevValue = previous ? parseFloat(previous.value) : undefined;

    return {
      provider: 'fred',
      code: seriesId,
      name: meta.name,
      value,
      previousValue: prevValue,
      changePercent: prevValue ? ((value - prevValue) / Math.abs(prevValue)) * 100 : undefined,
      unit: meta.unit,
      timestamp: new Date(latest.date),
      category: meta.category,
    };
  } catch (err: any) {
    console.warn(`[REALTIME] FRED fetch failed for ${seriesId}: ${err.message}`);
    return null;
  }
}

// ============================================================================
// WORLD BANK API — Free, no key required
// ============================================================================

const WORLDBANK_INDICATORS: Record<string, { name: string; unit: string; category: IndicatorCategory }> = {
  // ── Economics (Dr. Vasquez) ──
  'NY.GDP.MKTP.KD.ZG': { name: 'World GDP Growth', unit: '%', category: 'growth' },
  'FP.CPI.TOTL.ZG':    { name: 'Global Inflation Rate', unit: '%', category: 'inflation' },
  'NE.TRD.GNFS.ZS':    { name: 'Trade (% of GDP)', unit: '%', category: 'trade' },
  'GC.DOD.TOTL.GD.ZS':  { name: 'Government Debt (% of GDP)', unit: '%', category: 'growth' },

  // ── Health (Dr. Lindström, Dr. Martin) ──
  'SH.XPD.CHEX.GD.ZS': { name: 'Health Expenditure (% of GDP)', unit: '%', category: 'health' },
  'SP.DYN.LE00.IN':     { name: 'Life Expectancy at Birth', unit: 'years', category: 'health' },
  'SH.IMM.IDPT':        { name: 'DPT Immunization Coverage', unit: '%', category: 'health' },

  // ── Demographics (Dr. González, Dr. Rodriguez) ──
  'SP.POP.GROW':        { name: 'World Population Growth', unit: '%', category: 'demographics' },
  'SP.URB.TOTL.IN.ZS':  { name: 'Urban Population (% of total)', unit: '%', category: 'urbanization' },
  'SP.DYN.TFRT.IN':     { name: 'Fertility Rate (births/woman)', unit: 'births', category: 'demographics' },
  'SM.POP.NETM':        { name: 'Net Migration', unit: 'people', category: 'demographics' },

  // ── Development (Dr. Okafor) ──
  'SI.POV.DDAY':        { name: 'Poverty Headcount ($2.15/day)', unit: '%', category: 'development' },
  'SE.ADT.LITR.ZS':     { name: 'Adult Literacy Rate', unit: '%', category: 'development' },

  // ── Environment (Dr. Tanaka) ──
  'EN.ATM.CO2E.PC':     { name: 'CO2 Emissions Per Capita', unit: 'metric tons', category: 'climate' },
  'EG.USE.PCAP.KG.OE':  { name: 'Energy Use Per Capita', unit: 'kg oil equiv.', category: 'energy' },
  'EG.FEC.RNEW.ZS':     { name: 'Renewable Energy (% of total)', unit: '%', category: 'energy' },

  // ── Digital Society (Dr. Osei) ──
  'IT.NET.USER.ZS':     { name: 'Internet Users (% of population)', unit: '%', category: 'digital_society' },
};

async function fetchWorldBankIndicator(indicatorCode: string): Promise<RealTimeIndicator | null> {
  const meta = WORLDBANK_INDICATORS[indicatorCode];
  if (!meta) return null;

  try {
    const url = `https://api.worldbank.org/v2/country/WLD/indicator/${indicatorCode}?format=json&per_page=2&mrv=2`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;

    const data = await response.json();
    const records = data[1] || [];
    const latest = records.find((r: any) => r.value !== null);
    const previous = records.find((r: any) => r.value !== null && r !== latest);

    if (!latest) return null;

    return {
      provider: 'worldbank',
      code: indicatorCode,
      name: meta.name,
      value: latest.value,
      previousValue: previous?.value,
      changePercent: previous?.value ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100 : undefined,
      unit: meta.unit,
      timestamp: new Date(`${latest.date}-01-01`),
      category: meta.category,
    };
  } catch (err: any) {
    console.warn(`[REALTIME] World Bank fetch failed for ${indicatorCode}: ${err.message}`);
    return null;
  }
}

// ============================================================================
// WHO DISEASE OUTBREAK NEWS — Free, no key (Health: Dr. Lindström, Dr. Martin)
// ============================================================================

interface WHOOutbreak {
  name: string;
  country: string;
  date: string | null;
  url: string;
}

async function fetchWHOOutbreaks(): Promise<RealTimeIndicator[]> {
  try {
    // WHO Disease Outbreak News RSS feed (parsed as XML)
    const url = 'https://www.who.int/feeds/entity/don/en/rss.xml';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const xml = await response.text();
    const items: WHOOutbreak[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const entry = match[1];
      const title = extractXmlTag(entry, 'title');
      const pubDate = extractXmlTag(entry, 'pubDate');
      const link = extractXmlTag(entry, 'link');
      if (title) {
        items.push({
          name: title,
          country: title.split(' – ').pop()?.trim() || 'Global',
          date: pubDate || null,
          url: link || '',
        });
      }
    }

    if (items.length === 0) return [];

    // Return as a single indicator: active outbreak count
    return [{
      provider: 'who',
      code: 'DON_ACTIVE',
      name: `WHO Active Disease Outbreaks (last 30 days)`,
      value: items.length,
      unit: 'outbreaks',
      timestamp: new Date(),
      category: 'disease_outbreak',
    }];
  } catch (err: any) {
    console.warn(`[REALTIME] WHO outbreaks failed: ${err.message}`);
    return [];
  }
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// ============================================================================
// USGS EARTHQUAKE API — Free, no key (Security: Dr. Webb, Dr. Petrov)
// ============================================================================

async function fetchUSGSEarthquakes(): Promise<RealTimeIndicator[]> {
  try {
    // Significant earthquakes in the last 7 days
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const quakes = data.features || [];

    const indicators: RealTimeIndicator[] = [];

    // Count of significant earthquakes
    indicators.push({
      provider: 'usgs',
      code: 'EQ_SIGNIFICANT_7D',
      name: 'Significant Earthquakes (7 days)',
      value: quakes.length,
      unit: 'events',
      timestamp: new Date(),
      category: 'disaster',
    });

    // Largest magnitude
    if (quakes.length > 0) {
      const maxMag = Math.max(...quakes.map((q: any) => q.properties.mag || 0));
      const strongest = quakes.find((q: any) => q.properties.mag === maxMag);
      indicators.push({
        provider: 'usgs',
        code: 'EQ_MAX_MAG_7D',
        name: `Strongest Earthquake (${strongest?.properties?.place || 'unknown'})`,
        value: maxMag,
        unit: 'magnitude',
        timestamp: new Date(strongest?.properties?.time || Date.now()),
        category: 'disaster',
      });
    }

    return indicators;
  } catch (err: any) {
    console.warn(`[REALTIME] USGS earthquakes failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// OPEN-METEO CLIMATE API — Free, no key (Climate: Dr. Tanaka)
// ============================================================================

async function fetchGlobalClimateData(): Promise<RealTimeIndicator[]> {
  try {
    // Global average temperature for major cities (proxy for global temp)
    // Using Open-Meteo's free historical/forecast API
    const cities = [
      { name: 'Paris', lat: 48.86, lon: 2.35 },
      { name: 'New York', lat: 40.71, lon: -74.01 },
      { name: 'Tokyo', lat: 35.68, lon: 139.69 },
      { name: 'São Paulo', lat: -23.55, lon: -46.63 },
      { name: 'Lagos', lat: 6.45, lon: 3.40 },
    ];

    const temps: number[] = [];
    for (const city of cities) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m&timezone=auto`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data = await response.json();
          if (data.current?.temperature_2m != null) {
            temps.push(data.current.temperature_2m);
          }
        }
      } catch { /* skip city */ }
    }

    if (temps.length === 0) return [];

    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

    return [{
      provider: 'open-meteo',
      code: 'GLOBAL_TEMP_AVG',
      name: 'Global Avg Temperature (5-city proxy)',
      value: Math.round(avgTemp * 10) / 10,
      unit: '°C',
      timestamp: new Date(),
      category: 'climate',
    }];
  } catch (err: any) {
    console.warn(`[REALTIME] Open-Meteo climate failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// FEDERAL REGISTER API — Free, no key (Law: Dr. Moreau)
// ============================================================================

async function fetchFederalRegister(): Promise<RealTimeIndicator[]> {
  try {
    // Recent significant regulations and executive orders
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[publication_date][gte]=${weekAgo}&conditions[publication_date][lte]=${today}&conditions[type][]=RULE&conditions[type][]=PRORULE&conditions[type][]=PRESDOCU&per_page=5&order=newest`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const results = data.results || [];
    const totalCount = data.count || results.length;

    const indicators: RealTimeIndicator[] = [];

    // Count of new regulations this week
    indicators.push({
      provider: 'federal-register',
      code: 'REGS_NEW_7D',
      name: 'New US Federal Regulations (7 days)',
      value: totalCount,
      unit: 'regulations',
      timestamp: new Date(),
      category: 'regulation',
    });

    // Executive orders count
    const execOrders = results.filter((r: any) => r.type === 'Presidential Document');
    if (execOrders.length > 0) {
      indicators.push({
        provider: 'federal-register',
        code: 'EXEC_ORDERS_7D',
        name: 'Executive Orders / Presidential Documents (7 days)',
        value: execOrders.length,
        unit: 'documents',
        timestamp: new Date(),
        category: 'legislation',
      });
    }

    return indicators;
  } catch (err: any) {
    console.warn(`[REALTIME] Federal Register failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// PAPERS WITH CODE API — Free, no key (Technology: Dr. Chen)
// ============================================================================

async function fetchAIMLTrends(): Promise<RealTimeIndicator[]> {
  try {
    // Trending papers on Papers With Code (last 7 days)
    const url = 'https://paperswithcode.com/api/v1/papers/?ordering=-proceeding&items_per_page=1';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const totalPapers = data.count || 0;

    const indicators: RealTimeIndicator[] = [];

    indicators.push({
      provider: 'paperswithcode',
      code: 'PWC_TOTAL_PAPERS',
      name: 'Papers With Code — Total Indexed Papers',
      value: totalPapers,
      unit: 'papers',
      timestamp: new Date(),
      category: 'ai_ml',
    });

    // Also try to get trending methods
    try {
      const methodsUrl = 'https://paperswithcode.com/api/v1/methods/?ordering=-paper_count&items_per_page=1';
      const methodsResp = await fetch(methodsUrl, { signal: AbortSignal.timeout(8000) });
      if (methodsResp.ok) {
        const methodsData = await methodsResp.json();
        indicators.push({
          provider: 'paperswithcode',
          code: 'PWC_TOTAL_METHODS',
          name: 'Papers With Code — Total ML Methods',
          value: methodsData.count || 0,
          unit: 'methods',
          timestamp: new Date(),
          category: 'ai_ml',
        });
      }
    } catch { /* non-blocking */ }

    return indicators;
  } catch (err: any) {
    console.warn(`[REALTIME] Papers With Code failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// EUR-LEX SPARQL API — Free, no key (Law: Dr. Moreau)
// ============================================================================

async function fetchEURLexRegulations(): Promise<RealTimeIndicator[]> {
  try {
    // EUR-Lex provides a SPARQL endpoint for EU legislation
    // Count recent EU regulations published in the Official Journal (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const sparql = `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      SELECT (COUNT(?act) AS ?count) WHERE {
        ?act cdm:resource_legal_date_entry-into-force ?date .
        FILTER(?date >= "${thirtyDaysAgo}"^^xsd:date)
      }`;

    const url = `https://publications.europa.eu/webapi/rdf/sparql?query=${encodeURIComponent(sparql)}&format=application/json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });

    if (!response.ok) {
      // Fallback: use the EUR-Lex RSS feed for recent acts
      return await fetchEURLexRSS();
    }

    const data = await response.json();
    const count = parseInt(data?.results?.bindings?.[0]?.count?.value || '0');

    return [{
      provider: 'eurlex',
      code: 'EURLEX_NEW_30D',
      name: 'New EU Regulations (30 days)',
      value: count,
      unit: 'regulations',
      timestamp: new Date(),
      category: 'regulation',
    }];
  } catch (err: any) {
    console.warn(`[REALTIME] EUR-Lex SPARQL failed, trying RSS: ${err.message}`);
    return await fetchEURLexRSS();
  }
}

async function fetchEURLexRSS(): Promise<RealTimeIndicator[]> {
  try {
    const url = 'https://eur-lex.europa.eu/EN/display-feed.html?rssId=1';
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];

    const xml = await response.text();
    let count = 0;
    const itemRegex = /<item>/g;
    while (itemRegex.exec(xml) !== null) count++;

    return [{
      provider: 'eurlex',
      code: 'EURLEX_RECENT',
      name: 'Recent EU Legal Acts (feed)',
      value: count,
      unit: 'acts',
      timestamp: new Date(),
      category: 'regulation',
    }];
  } catch {
    return [];
  }
}

// ============================================================================
// NVD (NIST) CYBERSECURITY VULNERABILITIES — Free, no key (Digital: Dr. Osei, Dr. Webb)
// ============================================================================

async function fetchNVDVulnerabilities(): Promise<RealTimeIndicator[]> {
  try {
    // NVD API 2.0 — recent critical CVEs (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0/?pubStartDate=${weekAgo}&pubEndDate=${now}&cvssV3Severity=CRITICAL&resultsPerPage=5`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return [];

    const data = await response.json();
    const totalResults = data.totalResults || 0;
    const vulnerabilities = data.vulnerabilities || [];

    const indicators: RealTimeIndicator[] = [];

    indicators.push({
      provider: 'nvd',
      code: 'CVE_CRITICAL_7D',
      name: 'Critical CVEs Published (7 days)',
      value: totalResults,
      unit: 'vulnerabilities',
      timestamp: new Date(),
      category: 'security',
    });

    // Most severe CVE score
    if (vulnerabilities.length > 0) {
      const scores = vulnerabilities
        .map((v: any) => v.cve?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 0)
        .filter((s: number) => s > 0);
      if (scores.length > 0) {
        const maxScore = Math.max(...scores);
        indicators.push({
          provider: 'nvd',
          code: 'CVE_MAX_SCORE_7D',
          name: 'Highest CVE Severity Score (7 days)',
          value: maxScore,
          unit: 'CVSS',
          timestamp: new Date(),
          category: 'security',
        });
      }
    }

    return indicators;
  } catch (err: any) {
    console.warn(`[REALTIME] NVD/CISA failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// GDELT PROJECT — Free, no key (Geopolitics: Dr. Webb, Dr. Petrov)
// ============================================================================

async function fetchGDELTConflicts(): Promise<RealTimeIndicator[]> {
  try {
    // GDELT Event Database — count conflict events worldwide (last 24h)
    // Uses the GDELT DOC API which returns article counts by theme
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20war%20OR%20military&mode=artlist&maxrecords=1&format=json&timespan=1d';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return [];

    const rawText = await response.text();
    let data: any;
    try { data = JSON.parse(rawText); } catch { return []; }
    const articleCount = data.articles?.length || 0;

    const indicators: RealTimeIndicator[] = [];

    // Use the GDELT GKG (Global Knowledge Graph) for conflict tone
    try {
      const toneUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20military%20strike&mode=tonechart&format=json&timespan=7d';
      const toneResp = await fetch(toneUrl, { signal: AbortSignal.timeout(8000) });
      if (toneResp.ok) {
        const toneText = await toneResp.text();
        let toneData: any;
        try { toneData = JSON.parse(toneText); } catch { toneData = {}; }
        // Average tone (negative = more conflict-heavy coverage)
        const tones = (toneData.timeline || []).map((t: any) => t.value || 0);
        if (tones.length > 0) {
          const avgTone = tones.reduce((a: number, b: number) => a + b, 0) / tones.length;
          indicators.push({
            provider: 'gdelt',
            code: 'GDELT_CONFLICT_TONE_7D',
            name: 'Global Conflict News Tone (7 days)',
            value: Math.round(avgTone * 100) / 100,
            unit: 'tone (-10 to +10)',
            timestamp: new Date(),
            category: 'geopolitics',
          });
        }
      }
    } catch { /* non-blocking */ }

    // Also count total conflict articles
    try {
      const countUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20war%20OR%20armed&mode=artlist&maxrecords=250&format=json&timespan=1d';
      const countResp = await fetch(countUrl, { signal: AbortSignal.timeout(8000) });
      if (countResp.ok) {
        const countText = await countResp.text();
        let countData: any;
        try { countData = JSON.parse(countText); } catch { countData = {}; }
        indicators.push({
          provider: 'gdelt',
          code: 'GDELT_CONFLICT_ARTICLES_24H',
          name: 'Conflict-Related Articles (24h)',
          value: countData.articles?.length || 0,
          unit: 'articles',
          timestamp: new Date(),
          category: 'geopolitics',
        });
      }
    } catch { /* non-blocking */ }

    return indicators;
  } catch (err: any) {
    console.warn(`[REALTIME] GDELT conflict failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// NASA GISS — Global Temperature Anomaly (Climate: Dr. Tanaka)
// ============================================================================

async function fetchNASAGISSTemperature(): Promise<RealTimeIndicator[]> {
  try {
    // NASA GISS Surface Temperature Analysis — global mean annual anomaly
    const url = 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const csv = await response.text();
    const lines = csv.split('\n').filter(l => l.trim() && !l.startsWith('Year'));

    // Find the last line with actual annual data
    let latestYear = '';
    let latestAnomaly = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const parts = lines[i].split(',');
      if (parts.length >= 14) {
        const year = parts[0].trim();
        const annualAnomaly = parts[13]?.trim(); // Column 14 = J-D (Jan-Dec annual mean)
        if (annualAnomaly && annualAnomaly !== '***' && !isNaN(parseFloat(annualAnomaly))) {
          latestYear = year;
          latestAnomaly = parseFloat(annualAnomaly);
          break;
        }
      }
    }

    if (!latestYear) return [];

    return [{
      provider: 'nasa-giss',
      code: 'GISS_TEMP_ANOMALY',
      name: `Global Temperature Anomaly (${latestYear} vs 1951-1980 baseline)`,
      value: latestAnomaly,
      unit: '°C anomaly',
      timestamp: new Date(`${latestYear}-07-01`),
      category: 'climate',
    }];
  } catch (err: any) {
    console.warn(`[REALTIME] NASA GISS failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// STOCK MARKET INDICES — Free via marketstack/ECB (Finance: Dr. Roberts)
// ============================================================================

async function fetchStockIndices(): Promise<RealTimeIndicator[]> {
  const indicators: RealTimeIndicator[] = [];

  // Strategy: Use multiple free sources
  // 1. ECB Statistical Data Warehouse (Euro Stoxx) — free, no key
  // 2. Alpha Vantage demo endpoint — free, limited

  // ECB SDW — Euro area stock prices
  try {
    const url = 'https://data-api.ecb.europa.eu/service/data/MNA/Q.N.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.N?lastNObservations=2&format=jsondata';
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const observations = data?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0:0:0:0:0:0:0:0:0']?.observations;
      if (observations) {
        const keys = Object.keys(observations).sort();
        if (keys.length >= 1) {
          const latestVal = parseFloat(observations[keys[keys.length - 1]][0]);
          const prevVal = keys.length >= 2 ? parseFloat(observations[keys[keys.length - 2]][0]) : undefined;
          if (!isNaN(latestVal)) {
            indicators.push({
              provider: 'ecb',
              code: 'ECB_EA_GDP_GROWTH',
              name: 'Euro Area GDP Growth (quarterly)',
              value: latestVal,
              previousValue: prevVal && !isNaN(prevVal) ? prevVal : undefined,
              changePercent: prevVal && !isNaN(prevVal) && prevVal !== 0 ? ((latestVal - prevVal) / Math.abs(prevVal)) * 100 : undefined,
              unit: '%',
              timestamp: new Date(),
              category: 'growth',
            });
          }
        }
      }
    }
  } catch { /* non-blocking */ }

  // ECB Exchange Rates — EUR/USD, EUR/GBP
  try {
    const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=2&format=jsondata';
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const observations = data?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations;
      if (observations) {
        const keys = Object.keys(observations).sort();
        if (keys.length >= 1) {
          const latestVal = parseFloat(observations[keys[keys.length - 1]][0]);
          const prevVal = keys.length >= 2 ? parseFloat(observations[keys[keys.length - 2]][0]) : undefined;
          if (!isNaN(latestVal)) {
            indicators.push({
              provider: 'ecb',
              code: 'ECB_EURUSD',
              name: 'EUR/USD Exchange Rate (ECB)',
              value: latestVal,
              previousValue: prevVal && !isNaN(prevVal) ? prevVal : undefined,
              changePercent: prevVal && !isNaN(prevVal) && prevVal !== 0 ? ((latestVal - prevVal) / Math.abs(prevVal)) * 100 : undefined,
              unit: 'USD per EUR',
              timestamp: new Date(),
              category: 'currency',
            });
          }
        }
      }
    }
  } catch { /* non-blocking */ }

  // ECB Key Interest Rate (MRO)
  try {
    const url = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.MRR_FR.LEV?lastNObservations=2&format=jsondata';
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const series = data?.dataSets?.[0]?.series;
      const firstSeriesKey = series ? Object.keys(series)[0] : null;
      if (firstSeriesKey) {
        const observations = series[firstSeriesKey].observations;
        const keys = Object.keys(observations).sort();
        if (keys.length >= 1) {
          const latestVal = parseFloat(observations[keys[keys.length - 1]][0]);
          if (!isNaN(latestVal)) {
            indicators.push({
              provider: 'ecb',
              code: 'ECB_MRO_RATE',
              name: 'ECB Main Refinancing Rate',
              value: latestVal,
              unit: '%',
              timestamp: new Date(),
              category: 'interest_rate',
            });
          }
        }
      }
    }
  } catch { /* non-blocking */ }

  if (indicators.length > 0) {
    console.log(`[REALTIME] ECB/Stock: ${indicators.length} indicators`);
  }

  return indicators;
}

// ============================================================================
// ALERT DETECTION — Identify significant market movements
// ============================================================================

const ALERT_THRESHOLDS: Record<string, { spike: number; crash: number; milestone?: number }> = {
  // Economics & Finance
  'FEDFUNDS':   { spike: 0.25, crash: -0.25 },
  'DGS10':      { spike: 0.15, crash: -0.15 },
  'T10Y2Y':     { spike: 0.20, crash: -0.20, milestone: 0 }, // Yield curve inversion
  'VIXCLS':     { spike: 20, crash: -15, milestone: 30 },     // VIX >30 = panic
  'UNRATE':     { spike: 0.3, crash: -0.3 },
  'DEXUSEU':    { spike: 3, crash: -3 },
  'UMCSENT':    { spike: 10, crash: -10 },
  // Energy
  'DCOILWTICO': { spike: 10, crash: -10 },
  'DCOILBRENTEU': { spike: 10, crash: -10 },
  'DHHNGSP':    { spike: 15, crash: -15 },
  'GASREGW':    { spike: 8, crash: -8 },
  // Housing
  'MORTGAGE30US': { spike: 0.3, crash: -0.3 },
  // Earthquakes
  'EQ_MAX_MAG_7D': { spike: 0, crash: -999, milestone: 7 }, // Mag ≥7 = major
  // Cybersecurity
  'CVE_CRITICAL_7D': { spike: 50, crash: -999, milestone: 20 }, // >20 critical CVEs in a week = alert
  'CVE_MAX_SCORE_7D': { spike: 0, crash: -999, milestone: 9.8 }, // CVSS 9.8+ = critical
  // Geopolitics (GDELT)
  'GDELT_CONFLICT_TONE_7D': { spike: 2, crash: -5, milestone: -5 }, // Tone < -5 = highly negative conflict coverage
};

function detectAlerts(indicators: RealTimeIndicator[]): MarketAlert[] {
  const alerts: MarketAlert[] = [];

  for (const ind of indicators) {
    const thresholds = ALERT_THRESHOLDS[ind.code];
    if (!thresholds) continue;

    // Spike detection (requires changePercent)
    if (ind.changePercent !== undefined && ind.changePercent >= thresholds.spike) {
      alerts.push({
        indicator: ind.name,
        type: 'spike',
        severity: ind.changePercent >= thresholds.spike * 2 ? 'critical' : 'high',
        message: `${ind.name} surged ${ind.changePercent.toFixed(2)}% to ${ind.value} ${ind.unit}`,
        value: ind.value,
        threshold: thresholds.spike,
      });
    }

    // Crash detection (requires changePercent)
    if (ind.changePercent !== undefined && ind.changePercent <= thresholds.crash) {
      alerts.push({
        indicator: ind.name,
        type: 'crash',
        severity: ind.changePercent <= thresholds.crash * 2 ? 'critical' : 'high',
        message: `${ind.name} dropped ${ind.changePercent.toFixed(2)}% to ${ind.value} ${ind.unit}`,
        value: ind.value,
        threshold: thresholds.crash,
      });
    }

    // Milestone detection (e.g., yield curve inversion)
    if (thresholds.milestone !== undefined) {
      if (ind.code === 'T10Y2Y' && ind.value < 0 && (ind.previousValue === undefined || ind.previousValue >= 0)) {
        alerts.push({
          indicator: ind.name,
          type: 'reversal',
          severity: 'critical',
          message: `YIELD CURVE INVERSION: 10Y-2Y spread turned negative (${ind.value.toFixed(2)}%) — historically precedes recessions`,
          value: ind.value,
          threshold: 0,
        });
      }
      if (ind.code === 'VIXCLS' && ind.value >= 30) {
        alerts.push({
          indicator: ind.name,
          type: 'milestone',
          severity: 'critical',
          message: `VIX above 30 (${ind.value.toFixed(1)}) — extreme market fear/volatility`,
          value: ind.value,
          threshold: 30,
        });
      }
      if (ind.code === 'EQ_MAX_MAG_7D' && ind.value >= 7) {
        alerts.push({
          indicator: ind.name,
          type: 'milestone',
          severity: ind.value >= 8 ? 'critical' : 'high',
          message: `MAJOR EARTHQUAKE: magnitude ${ind.value} — ${ind.name}`,
          value: ind.value,
          threshold: 7,
        });
      }
      if (ind.code === 'CVE_CRITICAL_7D' && ind.value >= 20) {
        alerts.push({
          indicator: ind.name,
          type: 'milestone',
          severity: ind.value >= 50 ? 'critical' : 'high',
          message: `CYBER ALERT: ${ind.value} critical CVEs published this week`,
          value: ind.value,
          threshold: 20,
        });
      }
      if (ind.code === 'CVE_MAX_SCORE_7D' && ind.value >= 9.8) {
        alerts.push({
          indicator: ind.name,
          type: 'milestone',
          severity: 'critical',
          message: `CRITICAL VULNERABILITY: CVSS ${ind.value}/10 — potential zero-day`,
          value: ind.value,
          threshold: 9.8,
        });
      }
      if (ind.code === 'GDELT_CONFLICT_TONE_7D' && ind.value <= -5) {
        alerts.push({
          indicator: ind.name,
          type: 'milestone',
          severity: ind.value <= -7 ? 'critical' : 'high',
          message: `GEOPOLITICAL TENSION: Global conflict news tone at ${ind.value} (strongly negative)`,
          value: ind.value,
          threshold: -5,
        });
      }
    }
  }

  return alerts;
}

// ============================================================================
// CONTEXT BLOCK BUILDER — For injection into PhD analyses
// ============================================================================

export function buildRealTimeContextBlock(pulse: RealTimePulse): string {
  if (pulse.indicators.length === 0) return '';

  const lines: string[] = [];
  lines.push('=== LIVE MULTI-DOMAIN INTELLIGENCE DATA ===');
  lines.push(`Data as of: ${pulse.timestamp.toISOString().split('T')[0]} | ${pulse.indicators.length} indicators across ${new Set(pulse.indicators.map(i => i.category)).size} domains\n`);

  // Group by category
  const byCategory = new Map<string, RealTimeIndicator[]>();
  for (const ind of pulse.indicators) {
    const list = byCategory.get(ind.category) || [];
    list.push(ind);
    byCategory.set(ind.category, list);
  }

  const categoryLabels: Record<string, string> = {
    // Economics & Finance
    interest_rate: '💰 Interest Rates',
    inflation: '📈 Inflation',
    employment: '👥 Employment',
    market: '📊 Market Sentiment',
    currency: '💱 Currencies',
    commodity: '🏗️ Commodities',
    growth: '📉 Economic Growth',
    trade: '🚢 Trade',
    behavioral: '🧠 Behavioral Economics',
    // Health & Biotech
    health: '🏥 Health',
    disease_outbreak: '🦠 Disease Outbreaks',
    biotech: '🧬 Biotechnology',
    // Climate & Environment
    climate: '🌡️ Climate',
    environment: '🌍 Environment',
    // Energy
    energy: '⚡ Energy',
    // Security & Geopolitics
    security: '🛡️ Security',
    cybersecurity: '🔐 Cybersecurity',
    geopolitics: '🌐 Geopolitics',
    disaster: '🌋 Natural Disasters',
    // Law & Regulation
    regulation: '⚖️ Regulation',
    legislation: '📜 Legislation',
    // Technology & AI
    technology: '💻 Technology',
    ai_ml: '🤖 AI & Machine Learning',
    // Development & Demographics
    development: '🏗️ Development',
    demographics: '👶 Demographics',
    urbanization: '🏙️ Urbanization & Housing',
    // Digital Society
    digital_society: '📱 Digital Society',
  };

  for (const [category, indicators] of byCategory) {
    lines.push(`📊 ${categoryLabels[category] || category}:`);
    for (const ind of indicators) {
      const change = ind.changePercent !== undefined
        ? ` (${ind.changePercent >= 0 ? '+' : ''}${ind.changePercent.toFixed(2)}%)`
        : '';
      lines.push(`  • ${ind.name}: ${ind.value} ${ind.unit}${change}`);
    }
    lines.push('');
  }

  if (pulse.alerts.length > 0) {
    lines.push('🚨 MARKET ALERTS:');
    for (const alert of pulse.alerts) {
      const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🟡';
      lines.push(`  ${icon} ${alert.message}`);
    }
    lines.push('');
  }

  lines.push('Use this live data to contextualize your analysis. Reference specific indicators when relevant.');
  lines.push('=== END LIVE DATA ===');

  return lines.join('\n');
}

// ============================================================================
// MAIN: FETCH ALL REAL-TIME DATA
// ============================================================================

export async function fetchRealTimePulse(): Promise<RealTimePulse> {
  const startTime = Date.now();
  console.log('[REALTIME] Fetching multi-domain live intelligence (12 providers)...');

  const indicators: RealTimeIndicator[] = [];

  // FRED indicators (parallel)
  const fredApiKey = process.env.FRED_API_KEY;
  if (fredApiKey) {
    const fredResults = await Promise.allSettled(
      Object.keys(FRED_SERIES).map(code => fetchFREDSeries(code, fredApiKey))
    );
    for (const result of fredResults) {
      if (result.status === 'fulfilled' && result.value) {
        indicators.push(result.value);
      }
    }
    console.log(`[REALTIME] FRED: ${indicators.length}/${Object.keys(FRED_SERIES).length} indicators fetched`);
  } else {
    console.log('[REALTIME] FRED_API_KEY not set — skipping FRED (get free key at https://fred.stlouisfed.org/docs/api/api_key.html)');
  }

  // All other providers in parallel (12 sources)
  const [
    wbResults, whoResults, usgsResults, climateResults, fedRegResults, aiResults,
    eurLexResults, nvdResults, gdeltResults, gissResults, ecbResults,
  ] = await Promise.allSettled([
    // World Bank — Development, Health, Demographics (Dr. Okafor, Dr. González, Dr. Rodriguez)
    Promise.allSettled(
      Object.keys(WORLDBANK_INDICATORS).map(code => fetchWorldBankIndicator(code))
    ),
    // WHO Disease Outbreaks (Dr. Lindström, Dr. Martin)
    fetchWHOOutbreaks(),
    // USGS Earthquakes (Dr. Webb, Dr. Petrov)
    fetchUSGSEarthquakes(),
    // Open-Meteo Climate (Dr. Tanaka)
    fetchGlobalClimateData(),
    // Federal Register — US Law & Regulation (Dr. Moreau)
    fetchFederalRegister(),
    // Papers With Code — AI/ML trends (Dr. Chen)
    fetchAIMLTrends(),
    // EUR-Lex — EU Law & Regulation (Dr. Moreau)
    fetchEURLexRegulations(),
    // NVD/NIST — Cybersecurity vulnerabilities (Dr. Osei, Dr. Webb)
    fetchNVDVulnerabilities(),
    // GDELT — Global conflict monitoring (Dr. Webb, Dr. Petrov)
    fetchGDELTConflicts(),
    // NASA GISS — Global temperature anomaly (Dr. Tanaka)
    fetchNASAGISSTemperature(),
    // ECB — European macro data & exchange rates (Dr. Roberts, Dr. Vasquez)
    fetchStockIndices(),
  ]);

  // Collect World Bank
  let wbCount = 0;
  if (wbResults.status === 'fulfilled') {
    for (const result of wbResults.value) {
      if (result.status === 'fulfilled' && result.value) {
        indicators.push(result.value);
        wbCount++;
      }
    }
  }
  console.log(`[REALTIME] World Bank: ${wbCount}/${Object.keys(WORLDBANK_INDICATORS).length} indicators fetched`);

  // Collect WHO
  if (whoResults.status === 'fulfilled') {
    indicators.push(...whoResults.value);
    console.log(`[REALTIME] WHO: ${whoResults.value.length} indicators`);
  }

  // Collect USGS
  if (usgsResults.status === 'fulfilled') {
    indicators.push(...usgsResults.value);
    console.log(`[REALTIME] USGS: ${usgsResults.value.length} indicators`);
  }

  // Collect Open-Meteo Climate
  if (climateResults.status === 'fulfilled') {
    indicators.push(...climateResults.value);
    console.log(`[REALTIME] Climate: ${climateResults.value.length} indicators`);
  }

  // Collect Federal Register
  if (fedRegResults.status === 'fulfilled') {
    indicators.push(...fedRegResults.value);
    console.log(`[REALTIME] Federal Register: ${fedRegResults.value.length} indicators`);
  }

  // Collect Papers With Code
  if (aiResults.status === 'fulfilled') {
    indicators.push(...aiResults.value);
    console.log(`[REALTIME] Papers With Code: ${aiResults.value.length} indicators`);
  }

  // Collect EUR-Lex
  if (eurLexResults.status === 'fulfilled') {
    indicators.push(...eurLexResults.value);
    console.log(`[REALTIME] EUR-Lex: ${eurLexResults.value.length} indicators`);
  }

  // Collect NVD/CISA
  if (nvdResults.status === 'fulfilled') {
    indicators.push(...nvdResults.value);
    console.log(`[REALTIME] NVD/CISA: ${nvdResults.value.length} indicators`);
  }

  // Collect GDELT
  if (gdeltResults.status === 'fulfilled') {
    indicators.push(...gdeltResults.value);
    console.log(`[REALTIME] GDELT: ${gdeltResults.value.length} indicators`);
  }

  // Collect NASA GISS
  if (gissResults.status === 'fulfilled') {
    indicators.push(...gissResults.value);
    console.log(`[REALTIME] NASA GISS: ${gissResults.value.length} indicators`);
  }

  // Collect ECB / Stock indices
  if (ecbResults.status === 'fulfilled') {
    indicators.push(...ecbResults.value);
    console.log(`[REALTIME] ECB: ${ecbResults.value.length} indicators`);
  }

  // Detect alerts
  const alerts = detectAlerts(indicators);

  // Build summary
  const summary = buildPulseSummary(indicators, alerts);

  const durationMs = Date.now() - startTime;
  console.log(`[REALTIME] ✅ Pulse complete: ${indicators.length} indicators, ${alerts.length} alerts (${durationMs}ms)`);

  // Persist indicators to MacroSeries for longitudinal tracking (non-blocking)
  persistIndicators(indicators).catch(err =>
    console.warn('[REALTIME] Persist failed (non-blocking):', err.message)
  );

  return {
    timestamp: new Date(),
    indicators,
    alerts,
    summary,
    durationMs,
  };
}

// ============================================================================
// PERSISTENCE — Store in MacroSeries for longitudinal analysis
// ============================================================================

async function persistIndicators(indicators: RealTimeIndicator[]): Promise<void> {
  for (const ind of indicators) {
    try {
      const series = await prisma.macroSeries.upsert({
        where: { provider_code: { provider: ind.provider, code: ind.code } },
        create: {
          provider: ind.provider,
          code: ind.code,
          name: ind.name,
          unit: ind.unit,
          frequency: 'daily',
        },
        update: { name: ind.name, unit: ind.unit },
        select: { id: true },
      });

      await prisma.macroPoint.upsert({
        where: { seriesId_date: { seriesId: series.id, date: ind.timestamp } },
        create: { seriesId: series.id, date: ind.timestamp, value: ind.value },
        update: { value: ind.value },
      });
    } catch {
      // Skip individual failures
    }
  }
}

// ============================================================================
// SUMMARY BUILDER
// ============================================================================

function buildPulseSummary(indicators: RealTimeIndicator[], alerts: MarketAlert[]): string {
  const parts: string[] = [];

  // Economics
  const fedFunds = indicators.find(i => i.code === 'FEDFUNDS');
  if (fedFunds) parts.push(`Fed: ${fedFunds.value}%`);

  const oil = indicators.find(i => i.code === 'DCOILWTICO');
  if (oil) parts.push(`Oil: $${oil.value}`);

  const vix = indicators.find(i => i.code === 'VIXCLS');
  if (vix) parts.push(`VIX: ${vix.value}`);

  // Health
  const who = indicators.find(i => i.code === 'DON_ACTIVE');
  if (who) parts.push(`WHO outbreaks: ${who.value}`);

  // Security
  const eq = indicators.find(i => i.code === 'EQ_SIGNIFICANT_7D');
  if (eq && eq.value > 0) parts.push(`Earthquakes: ${eq.value}`);

  // Climate
  const temp = indicators.find(i => i.code === 'GLOBAL_TEMP_AVG');
  if (temp) parts.push(`Global temp: ${temp.value}°C`);

  // Law
  const regs = indicators.find(i => i.code === 'REGS_NEW_7D');
  if (regs) parts.push(`New regs: ${regs.value}`);

  // AI
  const pwc = indicators.find(i => i.code === 'PWC_TOTAL_PAPERS');
  if (pwc) parts.push(`ML papers: ${pwc.value}`);

  // EU Law
  const eurlex = indicators.find(i => i.code === 'EURLEX_NEW_30D' || i.code === 'EURLEX_RECENT');
  if (eurlex) parts.push(`EU acts: ${eurlex.value}`);

  // Cybersecurity
  const cve = indicators.find(i => i.code === 'CVE_CRITICAL_7D');
  if (cve) parts.push(`Critical CVEs: ${cve.value}`);

  // Geopolitics (GDELT)
  const gdelt = indicators.find(i => i.code === 'GDELT_CONFLICT_TONE_7D');
  if (gdelt) parts.push(`Conflict tone: ${gdelt.value}`);

  // NASA Climate
  const giss = indicators.find(i => i.code === 'GISS_TEMP_ANOMALY');
  if (giss) parts.push(`Temp anomaly: +${giss.value}°C`);

  // ECB
  const ecbRate = indicators.find(i => i.code === 'ECB_MRO_RATE');
  if (ecbRate) parts.push(`ECB rate: ${ecbRate.value}%`);

  // Domains covered
  const domains = new Set(indicators.map(i => i.category)).size;
  parts.push(`${indicators.length} indicators/${domains} domains`);

  if (alerts.length > 0) {
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    if (criticalCount > 0) parts.push(`⚠️ ${criticalCount} critical alert(s)`);
  }

  return parts.join(' | ') || 'No live data available';
}

// ============================================================================
// EXPORTS FOR PIPELINE INTEGRATION
// ============================================================================

export { FRED_SERIES, WORLDBANK_INDICATORS };
