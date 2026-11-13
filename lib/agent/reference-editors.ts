/**
 * REFERENCE EDITORS — authority publisher registry.
 *
 * Retrieval recalls broadly but cannot tell a World Bank report from a
 * content-farm page: both arrive as "web" sources. This registry maps URL
 * domains to editorial authority so ranking can prefer the publishers that
 * actually originate authoritative data and analysis — agencies,
 * international organizations, statistical offices, central banks,
 * research institutes. It complements (never replaces) the provider-based
 * trust tiers in enhanced-ranker: a peer-reviewed canonical paper still
 * outranks an institute report.
 *
 * Tiers:
 *   A — multilateral organizations & international agencies (primary data)
 *   B — government, statistical offices, central banks (official statistics)
 *   C — research institutes & think tanks (authoritative analysis)
 */

export type AuthorityTier = 'A' | 'B' | 'C';

export interface AuthorityMatch {
  tier: AuthorityTier;
  /** Ranking weight fed into calculateSourceAuthorityWeight / trust tier. */
  weight: number;
  label: string;
}

const TIER_A: Record<string, string> = {
  // Multilateral development & financial institutions
  'worldbank.org': 'World Bank', 'imf.org': 'IMF', 'oecd.org': 'OECD',
  'bis.org': 'Bank for International Settlements', 'wto.org': 'WTO',
  'iadb.org': 'Inter-American Development Bank', 'afdb.org': 'African Development Bank',
  'adb.org': 'Asian Development Bank', 'ebrd.com': 'EBRD', 'isdb.org': 'IsDB',
  // UN system & specialized agencies
  'un.org': 'United Nations', 'unctad.org': 'UNCTAD', 'undp.org': 'UNDP',
  'unep.org': 'UNEP', 'unhcr.org': 'UNHCR', 'wfp.org': 'WFP',
  'fao.org': 'FAO', 'who.int': 'WHO', 'ilo.org': 'ILO',
  'unesco.org': 'UNESCO', 'unicef.org': 'UNICEF', 'unido.org': 'UNIDO',
  'itu.int': 'ITU', 'wmo.int': 'WMO', 'imo.org': 'IMO',
  // Economic & energy agencies
  'iea.org': 'International Energy Agency', 'irena.org': 'IRENA',
  'opec.org': 'OPEC', 'eia.gov': 'US Energy Information Administration',
  'entsoe.eu': 'ENTSO-E', 'acer.europa.eu': 'ACER', 'entsog.eu': 'ENTSOG',
  // Climate & environment
  'ipcc.ch': 'IPCC', 'unfccc.int': 'UNFCCC', 'cbd.int': 'Convention on Biological Diversity',
  'cites.org': 'CITES', 'basel.int': 'Basel Convention', 'unccd.int': 'UNCCD',
  // Health & food security
  'gavi.org': 'Gavi', 'globalfund.org': 'Global Fund', 'cepi.net': 'CEPI',
  // Disarmament & security
  'iaea.org': 'IAEA', 'opcw.org': 'OPCW', 'unidir.org': 'UNIDIR',
  'sipri.org': 'SIPRI',
};

const TIER_B: Record<string, string> = {
  // US federal
  'federalreserve.gov': 'Federal Reserve', 'treasury.gov': 'US Treasury',
  'commerce.gov': 'US Commerce', 'state.gov': 'US State Department',
  'whitehouse.gov': 'White House', 'congress.gov': 'US Congress',
  'govinfo.gov': 'GovInfo', 'bls.gov': 'Bureau of Labor Statistics',
  'census.gov': 'US Census', 'bea.gov': 'Bureau of Economic Analysis',
  'nasa.gov': 'NASA', 'noaa.gov': 'NOAA', 'usgs.gov': 'USGS',
  'energy.gov': 'US DOE', 'nist.gov': 'NIST', 'cisa.gov': 'CISA',
  'cdc.gov': 'CDC', 'nih.gov': 'NIH', 'fda.gov': 'FDA',
  // Europe
  'ecb.europa.eu': 'European Central Bank', 'europa.eu': 'European Union',
  'eea.europa.eu': 'European Environment Agency', 'ema.europa.eu': 'EMA',
  'ecdc.europa.eu': 'ECDC', 'frontex.europa.eu': 'Frontex',
  'bundesbank.de': 'Bundesbank', 'bankofengland.co.uk': 'Bank of England',
  'banquedefrance.fr': 'Banque de France', 'bancaditalia.it': 'Bank of Italy',
  'bnc.pt': 'Banco de Portugal', 'dnb.nl': 'De Nederlandsche Bank',
  'riksbank.se': 'Sveriges Riksbank', 'nb.no': 'Norges Bank', 'snb.ch': 'SNB',
  // National statistical offices & finance ministries (selection)
  'ons.gov.uk': 'UK ONS', 'gov.uk': 'UK Government',
  'insee.fr': 'INSEE', 'data.gouv.fr': 'data.gouv', 'vie-publique.fr': 'Vie Publique',
  'economie.gouv.fr': 'French Economy Ministry', 'diplomatie.gouv.fr': 'French Foreign Ministry',
  'defense.gouv.fr': 'French Defense Ministry', 'elysee.fr': 'Élysée',
  'senat.fr': 'French Senate', 'assemblee-nationale.fr': 'National Assembly',
  'ademe.fr': 'ADEME', 'france-strategie.gouv.fr': 'France Stratégie',
  'destatis.de': 'Destatis', 'bundesregierung.de': 'German Government',
  'istat.it': 'ISTAT', 'governo.it': 'Italian Government',
  'ine.es': 'INE Spain', 'scb.se': 'Statistics Sweden', 'ssb.no': 'SSB Norway',
  'stat.fi': 'Statistics Finland', 'cbs.nl': 'CBS Netherlands',
  'statbel.fgov.be': 'Statbel Belgium', 'statec.lu': 'STATEC Luxembourg',
  'stats.gov.cn': 'China NBS', 'pboc.gov.cn': 'PBoC', 'mofcom.gov.cn': 'MOFCOM',
  'rbi.org.in': 'Reserve Bank of India', 'mospi.gov.in': 'MOSPI India',
  'stat.go.jp': 'Statistics Japan', 'boj.or.jp': 'Bank of Japan',
  'statssa.gov.za': 'Stats SA', 'estat.br': 'IBGE Brazil',
  'inegi.org.mx': 'INEGI Mexico', 'statcan.gc.ca': 'Statistics Canada',
  'abs.gov.au': 'ABS Australia', 'stats.govt.nz': 'Stats NZ',
  'mot.gov.il': 'Israel CBS', 'cbs.gov.il': 'Israel CBS',
  'gks.ru': 'Rosstat', 'stat.gov.kz': 'Bureau of National Statistics Kazakhstan',
  // Central banks & regulators (selection)
  'fca.org.uk': 'FCA', 'amf-france.org': 'AMF', 'acpr.banque-france.fr': 'ACPR',
  'bafin.de': 'BaFin', 'cnmv.es': 'CNMV', 'consob.it': 'CONSOB',
  'sec.gov': 'US SEC', 'occ.gov': 'OCC', 'fdic.gov': 'FDIC',
};

const TIER_C: Record<string, string> = {
  // Security & geopolitical institutes
  'iiss.org': 'IISS', 'lowyinstitute.org': 'Lowy Institute',
  'ifri.org': 'IFRI', 'swp-berlin.org': 'SWP', 'dgap.org': 'DGAP',
  'wilsoncenter.org': 'Wilson Center', 'stimson.org': 'Stimson Center',
  'cnas.org': 'CNAS', 'atlanticcouncil.org': 'Atlantic Council',
  'isn.ethz.ch': 'ETH ISN', 'merics.org': 'MERICS',
  'cset.georgetown.edu': 'CSET Georgetown',
  // Economic & policy institutes
  'piie.com': 'Peterson Institute', 'nber.org': 'NBER',
  'cepr.org': 'CEPR', 'iza.org': 'IZA', 'voxeu.org': 'VoxEU/CEPR',
  'bruegel.org': 'Bruegel', 'ecfr.eu': 'ECFR',
  'carnegieendowment.org': 'Carnegie Endowment',
  // Energy & climate institutes
  'energypolicy.columbia.edu': 'Columbia SIPA Center on Global Energy Policy',
  'rmi.org': 'RMI', 'wri.org': 'World Resources Institute',
  'wbcsd.org': 'WBCSD',
  'seforall.org': 'SEforALL', 'ecologic.eu': 'Ecologic Institute',
  // Tech & digital policy
  'newamerica.org': 'New America', 'c2es.org': 'C2ES',
  'technologyreview.com': 'MIT Technology Review',
  'futureoflife.org': 'Future of Life Institute',
  'cyber.harvard.edu': 'Harvard Berkman Klein Center',
  'lawfaremedia.org': 'Lawfare', 'justsecurity.org': 'Just Security',
  'rstreet.org': 'R Street Institute', 'mercatus.org': 'Mercatus Center',
  'rand.org': 'RAND', 'heritage.org': 'Heritage Foundation',
  'aei.org': 'AEI', 'hoover.org': 'Hoover Institution',
  'cato.org': 'Cato Institute', 'manhattan-institute.org': 'Manhattan Institute',
  'epi.org': 'Economic Policy Institute', 'cbpp.org': 'CBPP',
  'urban.org': 'Urban Institute',
};

const WEIGHT: Record<AuthorityTier, number> = { A: 0.88, B: 0.84, C: 0.80 };

/**
 * Curated subset for domain-restricted retrieval (Tavily/Exa
 * include_domains). Kept deliberately small: every domain here originates
 * primary data or authoritative analysis, so a domain-scoped query trades
 * recall for precision on exactly the corpus think-tank work needs.
 */
export const AUTHORITY_SEARCH_DOMAINS: string[] = [
  // Tier A — primary data
  'iea.org', 'irena.org', 'worldbank.org', 'imf.org', 'oecd.org',
  'un.org', 'unctad.org', 'bis.org', 'wto.org', 'fao.org', 'who.int',
  'ipcc.ch', 'unfccc.int', 'eia.gov', 'entsoe.eu', 'acer.europa.eu',
  'iaea.org', 'sipri.org',
  // Tier B — official statistics & central banks
  'federalreserve.gov', 'treasury.gov', 'ecb.europa.eu', 'europa.eu',
  'ons.gov.uk', 'insee.fr', 'data.gouv.fr', 'destatis.de', 'istat.it',
  'ine.es', 'scb.se', 'ssb.no', 'stat.fi', 'cbs.nl', 'statbel.fgov.be',
  'stats.gov.cn', 'rbi.org.in', 'mospi.gov.in', 'stat.go.jp', 'boj.or.jp',
  'statcan.gc.ca', 'abs.gov.au', 'sec.gov', 'bls.gov', 'census.gov',
  'gov.uk', 'governo.it', 'bundesregierung.de', 'vie-publique.fr',
  // Tier C — institutes
  'bruegel.org', 'csis.org', 'brookings.edu', 'chathamhouse.org',
  'cfr.org', 'rand.org', 'iiss.org', 'lowyinstitute.org', 'ifri.org',
  'swp-berlin.org', 'dgap.org', 'wilsoncenter.org', 'stimson.org',
  'cnas.org', 'atlanticcouncil.org', 'merics.org', 'cset.georgetown.edu',
  'piie.com', 'nber.org', 'voxeu.org', 'ecfr.eu', 'wri.org', 'rmi.org',
  'newamerica.org', 'lawfaremedia.org', 'justsecurity.org',
];

function hostOf(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase()
    .replace(/^www\./, '');
}

/**
 * Match a source URL against the registry. Subdomain-aware:
 * `reports.iea.org` matches `iea.org`, `ec.europa.eu` does not match
 * `europa.eu`? — it does via suffix rule; intentional, EU subdomains are EU.
 */
export function authorityMatch(url: string | null | undefined): AuthorityMatch | null {
  if (!url) return null;
  const host = hostOf(String(url));
  if (!host) return null;
  for (const [tier, table] of [['A', TIER_A], ['B', TIER_B], ['C', TIER_C]] as const) {
    for (const domain of Object.keys(table)) {
      if (host === domain || host.endsWith('.' + domain)) {
        return { tier, weight: WEIGHT[tier], label: table[domain] || domain };
      }
    }
  }
  return null;
}
