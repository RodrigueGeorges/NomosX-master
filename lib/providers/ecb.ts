/**
 * ECB (European Central Bank) client for monetary data
 * Official endpoint: https://data-api.ecb.europa.eu/service/data
 *
 * We request SDMX-JSON (ECB supports it via Accept header) and parse TIME_PERIOD.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

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

// Curated indicators (ECB SDMX series keys)
const ECB_INDICATORS: Record<string, { name: string; unit?: string; frequency?: string; startPeriod?: string }> = {
  // ECB path is /{dataset}/{seriesKey}
  "FM/B.U2.EUR.4F.KR.MRR_FR.LEV": { name: "ECB MRO rate", unit: "%", frequency: "monthly", startPeriod: "2010-01" },
  "ICP/M.U2.N.000000.4.ANR": { name: "HICP Euro Area (annual rate)", unit: "%", frequency: "monthly", startPeriod: "2010-01" },
};

function parseSdmxTime(period: string): Date | null {
  // ECB usually uses YYYY-MM for monthly or YYYY-Qx for quarterly
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

export async function fetchECBSeries(code: string): Promise<MacroSeries | null> {
  const base = env.ECB_API.replace(/\/$/, "");
  const indicator = ECB_INDICATORS[code];

  const sp = new URLSearchParams();
  if (indicator?.startPeriod) sp.set("startPeriod", indicator.startPeriod);

  const url = `${base}/${code}${sp.toString() ? `?${sp.toString()}` : ""}`;

  try {
    const data: any = await fetchFromProvider("ecb", url, {
      timeout: 20000,
      retries: 2,
      headers: {
        Accept: "application/vnd.sdmx.data+json;version=1.0.0-wd",
      },
    });

    const ds = data?.dataSets?.[0];
    const seriesObj = ds?.series || {};
    const seriesKey = Object.keys(seriesObj)[0];
    const observations: Record<string, any> = seriesKey ? seriesObj[seriesKey]?.observations || {} : {};

    const obsDims = data?.structure?.dimensions?.observation || [];
    const timeDim = obsDims.find((d: any) => String(d?.id || "").toLowerCase().includes("time"));
    const timeValues: Array<{ id: string }> = timeDim?.values || [];

    const points: MacroDataPoint[] = Object.entries(observations)
      .map(([obsIndex, obsValue]: [string, any]) => {
        const numValue = Array.isArray(obsValue) ? obsValue[0] : obsValue;
        if (numValue == null) return null;

        const period = timeValues[Number(obsIndex)]?.id;
        if (!period) return null;

        const date = parseSdmxTime(period);
        if (!date) return null;

        return { date, value: Number(numValue) };
      })
      .filter((p): p is MacroDataPoint => p !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const name = indicator?.name || code;

    return {
      provider: "ecb",
      code,
      name,
      unit: indicator?.unit,
      frequency: indicator?.frequency,
      points,
    };
  } catch (error: any) {
    console.error(`[ECB] Fetch failed for ${code}: ${error.message}`);
    return null;
  }
}

export async function ingestECBIndicators(): Promise<MacroSeries[]> {
  const series: MacroSeries[] = [];

  for (const code of Object.keys(ECB_INDICATORS)) {
    const data = await fetchECBSeries(code);
    if (data && data.points.length > 0) {
      series.push(data);
    }
  }

  return series;
}
