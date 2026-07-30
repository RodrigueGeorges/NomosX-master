/**
 * NomosX Eval Domain Tiers — classification par hostname (pas par provider).
 *
 * Tier 1: officiel, statistique, réglementaire, douanes, banques centrales,
 *         organisations internationales
 * Tier 2: presse primaire d'agence, données de marché, peer-review, éditeurs
 *         académiques
 * Tier 3: think tanks identifiés, presse spécialisée, agrégateurs (GDELT)
 * Tier 4: blogs vendeurs, contenu SEO, fermes à contenu, dépôts non revus
 *
 * Cette table est jetable — WO-6 la remplace par la table Prisma DomainTier.
 */

const DOMAIN_TIER_MAP: Record<string, 1 | 2 | 3 | 4> = {
  // ─── TIER 1: Officiel, statistique, réglementaire ───────────────
  "gov.uk": 1,
  "europa.eu": 1,
  "ec.europa.eu": 1,
  "eur-lex.europa.eu": 1,
  "eurostat.ec.europa.eu": 1,
  "federalreserve.gov": 1,
  "ecb.europa.eu": 1,
  "bis.org": 1,
  "imf.org": 1,
  "worldbank.org": 1,
  "oecd.org": 1,
  "un.org": 1,
  "unctad.org": 1,
  "wto.org": 1,
  "who.int": 1,
  "iea.org": 1,
  "ipcc.ch": 1,
  "nasa.gov": 1,
  "noaa.gov": 1,
  "epa.gov": 1,
  "census.gov": 1,
  "bls.gov": 1,
  "bea.gov": 1,
  "federalregister.gov": 1,
  "congress.gov": 1,
  "gao.gov": 1,
  "nber.org": 1,
  "stats.gov.cn": 1,
  "gov.cn": 1,
  "customs.gov.cn": 1,
  "dgbas.gov.tw": 1,
  "stat.go.jp": 1,
  "e-stat.go.jp": 1,
  "gov.br": 1,
  "ibge.gov.br": 1,
  "insee.fr": 1,
  "destatis.de": 1,
  "istat.it": 1,
  "ons.gov.uk": 1,
  "scb.se": 1,
  "ssb.no": 1,
  "dst.dk": 1,
  "stat.fi": 1,
  "cbs.nl": 1,
  "statbel.fgov.be": 1,
  "statistik.at": 1,
  "admin.ch": 1,
  "bfs.admin.ch": 1,
  "rba.gov.au": 1,
  "rbi.org.in": 1,
  "stats.govt.nz": 1,
  "bankofengland.co.uk": 1,
  "bankofcanada.ca": 1,
  "banque-france.fr": 1,
  "bundesbank.de": 1,

  // ─── TIER 2: Presse primaire, académique, données de marché ─────
  "reuters.com": 2,
  "bloomberg.com": 2,
  "ft.com": 2,
  "wsj.com": 2,
  "nytimes.com": 2,
  "economist.com": 2, // also tier 3 below — first match wins
  "nature.com": 2,
  "science.org": 2,
  "sciencedirect.com": 2,
  "springer.com": 2,
  "wiley.com": 2,
  "tandfonline.com": 2,
  "jstor.org": 2,
  "doi.org": 2,
  "pnas.org": 2,
  "bmj.com": 2,
  "thelancet.com": 2,
  "nejm.org": 2,
  "arxiv.org": 2,
  "pubmed.ncbi.nlm.nih.gov": 2,
  "ncbi.nlm.nih.gov": 2,
  "semanticscholar.org": 2,
  "openalex.org": 2,
  "crossref.org": 2,
  "doaj.org": 2,
  "ssrn.com": 2,
  "papers.ssrn.com": 2,
  "cepr.org": 2,
  "voxeu.org": 2,
  "iza.org": 2,
  "rfi.fr": 2,
  "lemonde.fr": 2,
  "theguardian.com": 2,
  "bbc.com": 2,
  "bbc.co.uk": 2,
  "apnews.com": 2,
  " AFP.com": 2,

  // ─── TIER 3: Think tanks, presse spé, agrégateurs ───────────────
  "gdeltproject.org": 3,
  "brookings.edu": 3,
  "rand.org": 3,
  "chathamhouse.org": 3,
  "cfr.org": 3,
  "bruegel.org": 3,
  "petersoninstitute.org": 3,
  "piie.com": 3,
  "ifri.org": 3,
  "iiss.org": 3,
  "sipri.org": 3,
  "cgdev.org": 3,
  "odi.org": 3,
  "heritage.org": 3,
  "aei.org": 3,
  "cato.org": 3,
  "atlanticcouncil.org": 3,
  "ecfr.eu": 3,
  "clingendael.org": 3,
  "swp-berlin.org": 3,
  "iss.europa.eu": 3,
  "energyinst.org": 3,
  "opec.org": 3,
  "energyintel.com": 3,
  "argusmedia.com": 3,
  "platts.com": 3,
  "s&p.com": 3,
  "moody's.com": 3,
  "fitchratings.com": 3,
  "foreignaffairs.com": 3,
  "foreignpolicy.com": 3,
  "thediplomat.com": 3,
  "euractiv.com": 3,
  "politico.eu": 3,
  "politico.com": 3,
  "al-monitor.com": 3,
  "jamestown.org": 3,
  "warontherocks.com": 3,
  "stratfor.com": 3,
  "rhg.com": 3,
  "merics.org": 3,
  "csis.org": 3,
  "carnegieendowment.org": 3,
  "carnegie.ru": 3,
  "wilsoncenter.org": 3,
  "ria.ru": 2,
  "tass.com": 2,
  "scmp.com": 2,
  "nikkei.com": 2,
  "ftchinese.com": 2,
  "cnbc.com": 2,
  "marketwatch.com": 2,
  "barrons.com": 2,
  "investing.com": 3,
  "tradingeconomics.com": 3,
  "statista.com": 3,
  "ourworldindata.org": 2,
  "worldindata.org": 2,
  "data.worldbank.org": 1,
  "data.imf.org": 1,
  "fred.stlouisfed.org": 1,
  "fredaccount.stlouisfed.org": 1,
  "research.stlouisfed.org": 1,
  "openknowledge.worldbank.org": 1,
  "documents.worldbank.org": 1,
  "policycommons.net": 3,
  "muse.jhu.edu": 2,
  "cambridge.org": 2,
  "oxfordacademic.com": 2,
  "academic.oup.com": 2,
  "emerald.com": 2,
  "mdpi.com": 2,
  "frontiersin.org": 2,
  "plos.org": 2,
  "biomedcentral.com": 2,
  "ascopubs.org": 2,
  "iopscience.iop.org": 2,
  "aps.org": 2,
  "ieee.org": 2,
  "acm.org": 2,
  "dl.acm.org": 2,
  "ieeexplore.ieee.org": 2,
  "researchgate.net": 3,
  "academia.edu": 3,
  "scholar.google.com": 3,
  "econpapers.repec.org": 2,
  "ideas.repec.org": 2,
  "repec.org": 2,

  // ─── TIER 4: Blogs, SEO, fermes à contenu ──────────────────────
  "medium.com": 4,
  "substack.com": 4,
  "linkedin.com": 4,
  "linkedin.com/pulse": 4,
  "quora.com": 4,
  "reddit.com": 4,
  "wikipedia.org": 4,
  "wikiwand.com": 4,
  "answers.com": 4,
  "thoughtco.com": 4,
  "investopedia.com": 4,
  "thesourcematerial.com": 4,
  "contentverse.com": 4,
  "blogspot.com": 4,
  "wordpress.com": 4,
  "tumblr.com": 4,
  "pinterest.com": 4,
  "facebook.com": 4,
  "twitter.com": 4,
  "x.com": 4,
  "youtube.com": 4,
  "tiktok.com": 4,
  "instagram.com": 4,
};

// Suffix-based tier classification for gov domains not in the explicit map
const GOV_SUFFIXES = [".gov", ".gov.uk", ".gov.au", ".gov.ca", ".gov.br", ".gouv.fr", ".gouv.be"];
const MIL_SUFFIXES = [".mil"];
const INTL_SUFFIXES = [".int", ".un.org"];

export function classifyDomain(hostname: string): 0 | 1 | 2 | 3 | 4 {
  // Direct match
  if (DOMAIN_TIER_MAP[hostname]) return DOMAIN_TIER_MAP[hostname];

  // Government suffixes → tier 1
  for (const suffix of GOV_SUFFIXES) {
    if (hostname.endsWith(suffix)) return 1;
  }
  for (const suffix of MIL_SUFFIXES) {
    if (hostname.endsWith(suffix)) return 1;
  }
  for (const suffix of INTL_SUFFIXES) {
    if (hostname.endsWith(suffix)) return 1;
  }

  // Academic .edu → tier 2
  if (hostname.endsWith(".edu")) return 2;
  if (hostname.endsWith(".ac.uk")) return 2;
  if (hostname.endsWith(".ac.jp")) return 2;
  if (hostname.endsWith(".ac.kr")) return 2;
  if (hostname.endsWith(".edu.au")) return 2;
  if (hostname.endsWith(".edu.cn")) return 2;
  if (hostname.endsWith(".edu.tw")) return 2;
  if (hostname.endsWith(".edu.sg")) return 2;

  // Unknown → 0 (unclassified)
  return 0;
}
