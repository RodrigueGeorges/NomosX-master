import { prisma } from '@/lib/db';

import { ingestEurostatIndicators } from '@/lib/providers/eurostat';
import { ingestECBIndicators } from '@/lib/providers/ecb';
import { ingestINSEEIndicators } from '@/lib/providers/insee';

export type MacroRefreshResult = {
  providers: Record<
    string,
    {
      series: number;
      points: number;
      errors: string[];
    }
  >;
  totalSeries: number;
  totalPoints: number;
};

async function upsertSeriesAndPoints(input: {
  provider: string;
  code: string;
  name: string;
  unit?: string;
  frequency?: string;
  points: Array<{ date: Date; value: number }>;
}): Promise<{ pointsUpserted: number }> {
  const series = await prisma.macroSeries.upsert({
    where: { provider_code: { provider: input.provider, code: input.code } },
    create: {
      provider: input.provider,
      code: input.code,
      name: input.name,
      unit: input.unit,
      frequency: input.frequency,
    },
    update: {
      name: input.name,
      unit: input.unit,
      frequency: input.frequency,
    },
    select: { id: true },
  });

  let upserted = 0;
  for (const p of input.points) {
    await prisma.macroPoint.upsert({
      where: { seriesId_date: { seriesId: series.id, date: p.date } },
      create: {
        seriesId: series.id,
        date: p.date,
        value: p.value,
      },
      update: {
        value: p.value,
      },
    });
    upserted += 1;
  }

  return { pointsUpserted: upserted };
}

export async function refreshMacroSeries(): Promise<MacroRefreshResult> {
  const providers: MacroRefreshResult["providers"] = {
    eurostat: { series: 0, points: 0, errors: [] },
    ecb: { series: 0, points: 0, errors: [] },
    insee: { series: 0, points: 0, errors: [] },
  };

  // EUROSTAT
  try {
    const series = await ingestEurostatIndicators();
    providers.eurostat.series = series.length;

    for (const s of series) {
      const r = await upsertSeriesAndPoints({
        provider: s.provider,
        code: s.code,
        name: s.name,
        unit: s.unit,
        frequency: s.frequency,
        points: s.points,
      });
      providers.eurostat.points += r.pointsUpserted;
    }
  } catch (e: any) {
    providers.eurostat.errors.push(e?.message || String(e));
  }

  // ECB
  try {
    const series = await ingestECBIndicators();
    providers.ecb.series = series.length;

    for (const s of series) {
      const r = await upsertSeriesAndPoints({
        provider: s.provider,
        code: s.code,
        name: s.name,
        unit: s.unit,
        frequency: s.frequency,
        points: s.points,
      });
      providers.ecb.points += r.pointsUpserted;
    }
  } catch (e: any) {
    providers.ecb.errors.push(e?.message || String(e));
  }

  // INSEE
  try {
    const series = await ingestINSEEIndicators();
    providers.insee.series = series.length;

    for (const s of series) {
      const r = await upsertSeriesAndPoints({
        provider: s.provider,
        code: s.code,
        name: s.name,
        unit: s.unit,
        frequency: s.frequency,
        points: s.points,
      });
      providers.insee.points += r.pointsUpserted;
    }
  } catch (e: any) {
    providers.insee.errors.push(e?.message || String(e));
  }

  const totalSeries = Object.values(providers).reduce((sum, p) => sum + p.series, 0);
  const totalPoints = Object.values(providers).reduce((sum, p) => sum + p.points, 0);

  return { providers, totalSeries, totalPoints };
}
