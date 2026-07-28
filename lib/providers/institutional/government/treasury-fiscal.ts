/**
 * US Treasury Fiscal Data — Federal financial data API
 * API: https://api.fiscaldata.treasury.gov/api/v1/ (free, no key, no registration)
 * Debt, revenue, spending, interest rates, savings bonds
 */

import axios from 'axios';

const TREASURY_API = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchTreasuryFiscal(query: string, limit = 10): Promise<any[]> {
  console.log(`[TreasuryFiscal] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    const endpoints = [
      { path: '/v2/accounting/od/debt_to_penny', label: 'Debt to the Penny' },
      { path: '/v2/accounting/od/avg_interest_rates', label: 'Average Interest Rates' },
      { path: '/v1/accounting/mts/mts_table1', label: 'Federal Receipts and Outlays' },
      { path: '/v1/accounting/dts/dts_table_1', label: 'Operating Cash Balance' },
    ];

    for (const ep of endpoints) {
      if (sources.length >= limit) break;
      try {
        const { data } = await axios.get(`${TREASURY_API}${ep.path}`, {
          params: { 'page[size]': 3 },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        if (data?.data?.length > 0) {
          sources.push({
            id: `treasury-fiscal:${ep.path.replace(/\//g, ':')}`,
            provider: 'treasury-fiscal',
            type: 'dataset',
            title: `US Treasury — ${ep.label}`,
            abstract: `US federal financial data: ${ep.label}. Latest records from Treasury Fiscal Data API. Relevant to: ${query}`,
            url: `https://fiscaldata.treasury.gov/datasets/${ep.path.split('/').pop()}/`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'US Treasury (Fiscal Service)',
            issuerType: 'government',
            language: 'en',
            oaStatus: 'open',
            hasFullText: true,
            topics: ['us-treasury', 'fiscal', 'finance', 'government'],
            raw: { source: 'treasury-fiscal', endpoint: ep.path, recordCount: data?.meta?.count ?? 0 },
          });
        }
      } catch { /* per-endpoint failure */ }
    }

    console.log(`[TreasuryFiscal] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[TreasuryFiscal] Search failed: ${error.message}`);
  }

  return sources;
}
