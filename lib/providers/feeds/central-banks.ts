/**
 * Central Banks & Monetary Authorities — ~55 sources.
 * Monetary policy, financial stability, CBDC, macro-prudential.
 */

import type { FeedSource } from './feed-engine';
import { GN } from './feed-engine';

const g = (provider: string, issuer: string, site: string, domains: string[], region: string, lang = 'en'): FeedSource => ({
  url: GN(site, issuer), provider, issuer, type: 'analysis', domains, region, lang,
});

const d = (provider: string, issuer: string, url: string, domains: string[], region: string, lang = 'en'): FeedSource => ({
  url, provider, issuer, type: 'analysis', domains, region, lang, direct: true,
});

export const CENTRAL_BANK_FEEDS: FeedSource[] = [
  // Global / hub
  g('bri', 'BIS (Bank for International Settlements)', 'bis.org', ['economics', 'monetary', 'banking', 'finance'], 'global'),
  d('fed', 'US Federal Reserve', 'https://www.federalreserve.gov/feeds/speeches.xml', ['economics', 'monetary', 'us', 'banking'], 'us'),
  g('fed-ny', 'Federal Reserve Bank of New York', 'newyorkfed.org', ['economics', 'monetary', 'us', 'markets'], 'us'),
  g('fed-sf', 'Federal Reserve Bank of San Francisco', 'frbsf.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-chicago', 'Federal Reserve Bank of Chicago', 'chicagofed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-boston', 'Federal Reserve Bank of Boston', 'bostonfed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-richmond', 'Federal Reserve Bank of Richmond', 'richmondfed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-atlanta', 'Federal Reserve Bank of Atlanta', 'frbatlanta.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-stlouis', 'Federal Reserve Bank of St. Louis', 'stlouisfed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-dallas', 'Federal Reserve Bank of Dallas', 'dallasfed.org', ['economics', 'energy', 'us'], 'us'),
  g('fed-minneapolis', 'Federal Reserve Bank of Minneapolis', 'minneapolisfed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-kc', 'Federal Reserve Bank of Kansas City', 'kansascityfed.org', ['economics', 'monetary', 'us'], 'us'),
  g('fed-cleveland', 'Federal Reserve Bank of Cleveland', 'clevelandfed.org', ['economics', 'inflation', 'us'], 'us'),
  g('fed-philadelphia', 'Federal Reserve Bank of Philadelphia', 'philadelphiafed.org', ['economics', 'monetary', 'us'], 'us'),
  // Eurozone & EU
  d('ecb-press', 'European Central Bank', 'https://www.ecb.europa.eu/rss/press.html', ['economics', 'monetary', 'euro', 'eu', 'banking'], 'eu'),
  g('bundesbank', 'Deutsche Bundesbank', 'bundesbank.de', ['economics', 'monetary', 'germany', 'eu'], 'eu', 'de'),
  g('bdf', 'Banque de France', 'banque-france.fr', ['economics', 'monetary', 'france', 'eu'], 'eu', 'fr'),
  g('bdi', 'Banca d Italia', 'bancaditalia.it', ['economics', 'monetary', 'italy', 'eu'], 'eu', 'it'),
  g('bde', 'Banco de Espana', 'bde.es', ['economics', 'monetary', 'spain', 'eu'], 'eu', 'es'),
  g('dnb', 'De Nederlandsche Bank', 'dnb.nl', ['economics', 'monetary', 'netherlands', 'eu'], 'eu', 'nl'),
  g('nbb', 'National Bank of Belgium', 'nbb.be', ['economics', 'monetary', 'belgium', 'eu'], 'eu'),
  g('oenb', 'Oesterreichische Nationalbank', 'oenb.at', ['economics', 'monetary', 'austria', 'eu'], 'eu', 'de'),
  g('bportugal', 'Banco de Portugal', 'bportugal.pt', ['economics', 'monetary', 'portugal', 'eu'], 'eu', 'pt'),
  g('centralbank-ie', 'Central Bank of Ireland', 'centralbank.ie', ['economics', 'monetary', 'ireland', 'eu'], 'eu'),
  g('bankofgreece', 'Bank of Greece', 'bankofgreece.gr', ['economics', 'monetary', 'greece', 'eu'], 'eu'),
  g('nbp', 'Narodowy Bank Polski', 'nbp.pl', ['economics', 'monetary', 'poland', 'eu'], 'eu', 'pl'),
  g('cnb', 'Czech National Bank', 'cnb.cz', ['economics', 'monetary', 'czechia', 'eu'], 'eu'),
  g('mnb', 'Magyar Nemzeti Bank', 'mnb.hu', ['economics', 'monetary', 'hungary', 'eu'], 'eu', 'hu'),
  g('bnro', 'National Bank of Romania', 'bnro.ro', ['economics', 'monetary', 'romania', 'eu'], 'eu'),
  g('rijksbank', 'Sveriges Riksbank', 'riksbank.se', ['economics', 'monetary', 'sweden'], 'eu'),
  g('norges', 'Norges Bank', 'norges-bank.no', ['economics', 'monetary', 'norway', 'sovereign-fund'], 'eu'),
  g('danmarks', 'Danmarks Nationalbank', 'nationalbanken.dk', ['economics', 'monetary', 'denmark'], 'eu'),
  g('bof-finland', 'Bank of Finland', 'bof.fi', ['economics', 'monetary', 'finland', 'eu'], 'eu'),
  // Rest of world majors
  d('boe', 'Bank of England', 'https://www.bankofengland.co.uk/rss/news', ['economics', 'monetary', 'uk', 'banking'], 'eu'),
  g('snb', 'Swiss National Bank', 'snb.ch', ['economics', 'monetary', 'switzerland', 'fx'], 'eu'),
  d('boj', 'Bank of Japan', 'https://www.boj.or.jp/en/rss/whatsnew.xml', ['economics', 'monetary', 'japan', 'asia'], 'asia'),
  d('boc', 'Bank of Canada', 'https://www.bankofcanada.ca/feed/', ['economics', 'monetary', 'canada'], 'us'),
  g('rba', 'Reserve Bank of Australia', 'rba.gov.au', ['economics', 'monetary', 'australia'], 'asia'),
  g('rbnz', 'Reserve Bank of New Zealand', 'rbnz.govt.nz', ['economics', 'monetary', 'new-zealand'], 'asia'),
  g('mas', 'Monetary Authority of Singapore', 'mas.gov.sg', ['economics', 'monetary', 'singapore', 'fintech'], 'asia'),
  g('hkma', 'Hong Kong Monetary Authority', 'hkma.gov.hk', ['economics', 'monetary', 'hong-kong', 'asia'], 'asia'),
  g('bok', 'Bank of Korea', 'bok.or.kr', ['economics', 'monetary', 'korea', 'asia'], 'asia'),
  g('rbi', 'Reserve Bank of India', 'rbi.org.in', ['economics', 'monetary', 'india', 'asia'], 'asia'),
  g('pboc', 'People s Bank of China', 'pbc.gov.cn', ['economics', 'monetary', 'china', 'asia'], 'asia', 'zh'),
  g('bcb', 'Banco Central do Brasil', 'bcb.gov.br', ['economics', 'monetary', 'brazil', 'latam'], 'latam', 'pt'),
  g('banxico', 'Banco de Mexico', 'banxico.org.mx', ['economics', 'monetary', 'mexico', 'latam'], 'latam', 'es'),
  g('bcch', 'Banco Central de Chile', 'bcentral.cl', ['economics', 'monetary', 'chile', 'latam'], 'latam', 'es'),
  g('bcrp', 'Banco Central de Reserva del Peru', 'bcrp.gob.pe', ['economics', 'monetary', 'peru', 'latam'], 'latam', 'es'),
  g('banrep', 'Banco de la Republica Colombia', 'banrep.gov.co', ['economics', 'monetary', 'colombia', 'latam'], 'latam', 'es'),
  g('sarb', 'South African Reserve Bank', 'resbank.co.za', ['economics', 'monetary', 'south-africa', 'africa'], 'africa'),
  g('cbn', 'Central Bank of Nigeria', 'cbn.gov.ng', ['economics', 'monetary', 'nigeria', 'africa'], 'africa'),
  g('cbk', 'Central Bank of Kenya', 'centralbank.go.ke', ['economics', 'monetary', 'kenya', 'africa'], 'africa'),
  g('cbt', 'Central Bank of Turkey', 'tcmb.gov.tr', ['economics', 'monetary', 'turkey', 'inflation'], 'mena', 'tr'),
  g('boi', 'Bank of Israel', 'boi.org.il', ['economics', 'monetary', 'israel'], 'mena'),
  g('sama', 'Saudi Central Bank', 'sama.gov.sa', ['economics', 'monetary', 'saudi', 'oil', 'mena'], 'mena', 'ar'),
  g('cbuae', 'Central Bank of UAE', 'centralbank.ae', ['economics', 'monetary', 'uae', 'mena'], 'mena'),
  g('bot', 'Bank of Thailand', 'bot.or.th', ['economics', 'monetary', 'thailand', 'asia'], 'asia'),
  g('bi-indonesia', 'Bank Indonesia', 'bi.go.id', ['economics', 'monetary', 'indonesia', 'asia'], 'asia'),
  g('bnm', 'Bank Negara Malaysia', 'bnm.gov.my', ['economics', 'monetary', 'malaysia', 'asia'], 'asia'),
];
