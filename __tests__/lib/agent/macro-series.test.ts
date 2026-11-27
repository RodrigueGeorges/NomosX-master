/**
 * P0-C macro floor — spec selection is pure/deterministic: every query
 * gets domain-matched DBnomics (INSEE/Eurostat/OECD/IMF) + FRED specs
 * plus the always-on macro floor, deduped and capped.
 */
import { macroSpecsForQuery } from '@/lib/agent/macro-series';

describe('macroSpecsForQuery', () => {
  it('always returns the macro floor even for off-domain questions', () => {
    const specs = macroSpecsForQuery('Delphi method adoption in healthcare forecasting');
    expect(specs.length).toBeGreaterThanOrEqual(3);
    expect(specs.some(s => s.provider === 'IMF' && s.dataset === 'WEO')).toBe(true);
    expect(specs.some(s => s.fredKey === 'rates')).toBe(true);
  });

  it('matches inflation questions to INSEE/Eurostat/FRED specs', () => {
    const specs = macroSpecsForQuery('Will inflation exceed 3% in the eurozone by 2027?');
    const keys = specs.map(s => s.fredKey ?? `${s.provider}/${s.dataset}`);
    expect(keys).toContain('INSEE/IPC-2015');
    expect(keys).toContain('Eurostat/prc_hicp_midx');
    expect(keys).toContain('inflation');
  });

  it('matches energy questions to Eurostat renewables + FRED energy', () => {
    const specs = macroSpecsForQuery('Will renewable capacity reach 50% of installed capacity by 2030?');
    const keys = specs.map(s => s.fredKey ?? `${s.provider}/${s.dataset}`);
    expect(keys).toContain('Eurostat/nrg_ind_ren');
    expect(keys).toContain('energy');
  });

  it('dedupes repeated provider/dataset specs', () => {
    const specs = macroSpecsForQuery('GDP growth and inflation and unemployment trends');
    const keys = specs.map(s => s.fredKey ?? `${s.provider}/${s.dataset}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('caps the fetch count', () => {
    expect(macroSpecsForQuery('everything at once: gdp inflation unemployment energy trade climate debt', 6).length).toBeLessThanOrEqual(6);
  });
});
