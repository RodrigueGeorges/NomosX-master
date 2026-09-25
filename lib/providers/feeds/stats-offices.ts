/**
 * National Statistical Offices — ~50 sources.
 * Demographics, labour, inflation, trade, census data.
 */

import type { FeedSource } from './feed-engine';
import { GN } from './feed-engine';

const g = (provider: string, issuer: string, site: string, region: string, lang = 'en'): FeedSource => ({
  url: GN(site, issuer), provider, issuer, type: 'data', domains: ['statistics', 'demographics', 'economics'], region, lang,
});

export const STATS_OFFICE_FEEDS: FeedSource[] = [
  // Europe
  g('ons', 'UK Office for National Statistics', 'ons.gov.uk', 'eu'),
  g('destatis', 'Destatis (Germany)', 'destatis.de', 'eu', 'de'),
  g('istat-it', 'ISTAT (Italy)', 'istat.it', 'eu', 'it'),
  g('ine-es', 'INE (Spain)', 'ine.es', 'eu', 'es'),
  g('cbs-nl', 'CBS Statistics Netherlands', 'cbs.nl', 'eu', 'nl'),
  g('statbel', 'Statbel (Belgium)', 'statbel.fgov.be', 'eu', 'nl'),
  g('scb', 'Statistics Sweden', 'scb.se', 'eu', 'sv'),
  g('ssb-no', 'Statistics Norway', 'ssb.no', 'eu', 'no'),
  g('statbank-dk', 'Statistics Denmark', 'dst.dk', 'eu', 'da'),
  g('stat-fi', 'Statistics Finland', 'stat.fi', 'eu'),
  g('bfs-ch', 'Swiss Federal Statistical Office', 'bfs.admin.ch', 'eu', 'de'),
  g('statistik-at', 'Statistik Austria', 'statistik.at', 'eu', 'de'),
  g('cso-ie', 'Central Statistics Office Ireland', 'cso.ie', 'eu'),
  g('gus', 'Statistics Poland GUS', 'stat.gov.pl', 'eu', 'pl'),
  g('czso', 'Czech Statistical Office', 'czso.cz', 'eu', 'cs'),
  g('susr', 'Statistical Office of Slovakia', 'statistics.sk', 'eu', 'sk'),
  g('ksh', 'Hungarian Central Statistical Office', 'ksh.hu', 'eu', 'hu'),
  g('insse', 'INS Romania', 'insse.ro', 'eu', 'ro'),
  g('nsi-bg', 'National Statistical Institute Bulgaria', 'nsi.bg', 'eu', 'bg'),
  g('elstat', 'ELSTAT Greece', 'statistics.gr', 'eu', 'el'),
  g('ine-pt', 'INE Portugal', 'ine.pt', 'eu', 'pt'),
  g('dzs', 'Croatian Bureau of Statistics', 'dzs.gov.hr', 'eu', 'hr'),
  g('surs', 'Statistical Office Slovenia', 'stat.si', 'eu', 'sl'),
  g('csb-lv', 'Central Statistical Bureau Latvia', 'csb.gov.lv', 'eu', 'lv'),
  g('lsd', 'Statistics Lithuania', 'osp.stat.gov.lt', 'eu', 'lt'),
  g('stat-ee', 'Statistics Estonia', 'stat.ee', 'eu', 'et'),
  g('statec', 'STATEC Luxembourg', 'statistiques.public.lu', 'eu', 'fr'),
  g('cystat', 'CyStat Cyprus', 'cystat.gov.cy', 'eu'),
  g('turkstat', 'TurkStat Turkey', 'tuik.gov.tr', 'mena', 'tr'),
  g('cbs-il', 'Israel Central Bureau of Statistics', 'cbs.gov.il', 'mena'),
  // Americas
  g('census', 'US Census Bureau', 'census.gov', 'us'),
  g('bls', 'US Bureau of Labor Statistics', 'bls.gov', 'us'),
  g('bea', 'US Bureau of Economic Analysis', 'bea.gov', 'us'),
  g('statcan', 'Statistics Canada', 'statcan.gc.ca', 'us'),
  g('inegi', 'INEGI Mexico', 'inegi.org.mx', 'latam', 'es'),
  g('ibge', 'IBGE Brazil', 'ibge.gov.br', 'latam', 'pt'),
  g('indec', 'INDEC Argentina', 'indec.gob.ar', 'latam', 'es'),
  g('ine-cl', 'INE Chile', 'ine.gob.cl', 'latam', 'es'),
  g('dane', 'DANE Colombia', 'dane.gov.co', 'latam', 'es'),
  // Asia-Pacific
  g('stat-jp', 'Statistics Bureau of Japan', 'stat.go.jp', 'asia'),
  g('kostat', 'Statistics Korea', 'kostat.go.kr', 'asia'),
  g('nbs-cn', 'National Bureau of Statistics China', 'stats.gov.cn', 'asia', 'zh'),
  g('mospi', 'MOSPI India', 'mospi.gov.in', 'asia'),
  g('abs', 'Australian Bureau of Statistics', 'abs.gov.au', 'asia'),
  g('statsnz', 'Stats NZ', 'stats.govt.nz', 'asia'),
  g('bps', 'BPS Statistics Indonesia', 'bps.go.id', 'asia'),
  g('psa', 'Philippine Statistics Authority', 'psa.gov.ph', 'asia'),
  g('singstat', 'SingStat Singapore', 'singstat.gov.sg', 'asia'),
  // Africa & MENA
  g('statssa', 'Statistics South Africa', 'statssa.gov.za', 'africa'),
  g('knbs', 'Kenya National Bureau of Statistics', 'knbs.or.ke', 'africa'),
  g('nbs-ng', 'National Bureau of Statistics Nigeria', 'nigerianstat.gov.ng', 'africa'),
  g('capmas', 'CAPMAS Egypt', 'capmas.gov.eg', 'africa', 'ar'),
];
