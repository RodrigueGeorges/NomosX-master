/**
 * INSEE client for French economic data
 *
 * - Time series: INSEE BDM (SDMX-XML)
 *   Example: https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/000857179
 * - Dataset search: Melodi API (requires token)
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';
import { searchMelodi } from './melodi';

export interface MacroDataPoint {
  date: Date;
  value: number;
}

export interface MacroSeries {
  provider: string;
  code: string;
  name: string;
  description?: string;
  unit?: string;
  frequency?: string;
  points: MacroDataPoint[];
}

// Curated indicators (BDM series codes)
const INSEE_INDICATORS: Record<string, { name: string; unit?: string; frequency?: string }> = {
  // NOTE: These are placeholders / demo series codes. Adjust based on your editorial needs.
  "000857179": { name: "INSEE series 000857179", frequency: "monthly" },
};

function parseInseePeriod(period: string): Date | null {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-");
    return new Date(Number(y), Number(m) - 1, 1);
  }
  if (/^\d{4}-Q[1-4]$/.test(period)) {
    const y = Number(period.slice(0, 4));
    const q = Number(period.slice(6, 7));
    return new Date(y, (q - 1) * 3, 1);
  }
  if (/^\d{4}$/.test(period)) {
    return new Date(Number(period), 0, 1);
  }
  const d = new Date(period);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseInseeSdmxXml(xml: string): MacroDataPoint[] {
  // StructureSpecificData contains many <Obs TIME_PERIOD="..." OBS_VALUE="..." .../>
  const re = /<Obs\s+[^>]*TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"[^>]*\/>/g;
  const points: MacroDataPoint[] = [];
  let m: RegExpExecArray | null = null;

  while ((m = re.exec(xml))) {
    const period = m[1];
    const valueStr = m[2];
    const date = parseInseePeriod(period);
    const value = Number(valueStr);
    if (!date || Number.isNaN(value)) continue;
    points.push({ date, value });
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function fetchINSEESeries(code: string): Promise<MacroSeries | null> {
  const baseRaw = env.INSEE_API.replace(/\/$/, "");

  // Normalize INSEE base:
  // - env may be set to https://api.insee.fr/series/BDM/V1 (common)
  // - or https://api.insee.fr/series/BDM/V1/data (preferred)
  // We need .../data/SERIES_BDM/<code>
  const base = baseRaw.endsWith("/data") ? baseRaw : `${baseRaw}/data`;
  const url = `${base}/SERIES_BDM/${code}`;

  try {
    const xml: string = await fetchFromProvider("insee", url, {
      timeout: 20000,
      retries: 2,
      responseType: "text",
      headers: {
        Accept: "application/xml",
      },
    });

    const points = parseInseeSdmxXml(xml);

    const meta = INSEE_INDICATORS[code] || { name: code };

    return {
      provider: "insee",
      code,
      name: meta.name,
      unit: meta.unit,
      frequency: meta.frequency,
      points,
    };
  } catch (error: any) {
    console.error(`[INSEE] Fetch failed for ${code}: ${error.message}`);
    return null;
  }
}

export async function ingestINSEEIndicators(): Promise<MacroSeries[]> {
  const series: MacroSeries[] = [];

  for (const code of Object.keys(INSEE_INDICATORS)) {
    const data = await fetchINSEESeries(code);
    if (data && data.points.length > 0) {
      series.push(data);
    }
  }

  return series;
}

/**
 * Search INSEE datasets using Melodi API.
 * Requires INSEE_API_KEY (bearer token) to be set.
 */
export async function searchINSEE(query: string, limit = 10): Promise<any[]> {
  try {
    console.log(`[INSEE] Searching Melodi for: "${query}"`);

    const results = await searchMelodi(query, limit);

    // Transform to INSEE format for compatibility
    return results.map((dataset) => ({
      ...dataset,
      provider: "insee", // Keep legacy provider name
      originalProvider: "melodi",
    }));
  } catch (error: any) {
    console.error(`[INSEE] Melodi search failed: ${error.message}`);
    return [];
  }
}
