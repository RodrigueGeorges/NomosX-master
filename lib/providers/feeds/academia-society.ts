/**
 * Academia, civil society, science media & public data — ~80 sources.
 */

import type { FeedSource } from './feed-engine';
import { GN } from './feed-engine';

const g = (provider: string, issuer: string, site: string, domains: string[], region = 'global', lang = 'en'): FeedSource => ({
  url: GN(site, issuer), provider, issuer, type: 'analysis', domains, region, lang,
});

const d = (provider: string, issuer: string, url: string, domains: string[], region = 'global', lang = 'en'): FeedSource => ({
  url, provider, issuer, type: 'analysis', domains, region, lang, direct: true,
});

export const ACADEMIA_FEEDS: FeedSource[] = [
  // University presses & policy schools
  g('harvard-gazette', 'Harvard Gazette', 'news.harvard.edu', ['us', 'research', 'university'], 'us'),
  g('mit-news', 'MIT News', 'news.mit.edu', ['us', 'tech', 'research'], 'us'),
  g('stanford-news', 'Stanford News', 'news.stanford.edu', ['us', 'research', 'tech'], 'us'),
  g('oxford-news', 'University of Oxford', 'ox.ac.uk', ['uk', 'research'], 'eu'),
  g('cambridge-news', 'University of Cambridge', 'cam.ac.uk', ['uk', 'research'], 'eu'),
  g('lse-news', 'LSE', 'lse.ac.uk', ['uk', 'economics', 'social-science'], 'eu'),
  g('ethz-news', 'ETH Zurich', 'ethz.ch', ['switzerland', 'tech', 'research'], 'eu'),
  g('nus-news', 'NUS', 'nus.edu.sg', ['singapore', 'research', 'asia'], 'asia'),
  g('princeton-news', 'Princeton', 'princeton.edu', ['us', 'research'], 'us'),
  g('yale-news', 'Yale', 'yale.edu', ['us', 'research'], 'us'),
  g('berkeley-news', 'UC Berkeley', 'berkeley.edu', ['us', 'research'], 'us'),
  g('uchicago-news', 'UChicago', 'uchicago.edu', ['us', 'economics', 'research'], 'us'),
  g('columbia-news', 'Columbia', 'columbia.edu', ['us', 'research'], 'us'),
  g('sps-columbia', 'Columbia SIPA', 'sipa.columbia.edu', ['us', 'policy', 'international'], 'us'),
  g('kellogg', 'Kellogg Insight', 'insight.kellogg.northwestern.edu', ['business', 'management', 'research'], 'us'),
  g('hbs', 'Harvard Business School', 'hbs.edu', ['business', 'management'], 'us'),
  g('insead', 'INSEAD Knowledge', 'knowledge.insead.edu', ['business', 'management', 'eu'], 'eu'),
  g('weforum', 'World Economic Forum', 'weforum.org', ['davos', 'economics', 'global', 'foresight']),
  g('cato-x', 'Cato Institute', 'cato.org', ['libertarian', 'us', 'policy'], 'us'),
  g('brookings-x', 'Brookings', 'brookings.edu', ['us', 'policy'], 'us'),
  g('rand-x', 'RAND', 'rand.org', ['us', 'defense', 'policy'], 'us'),
  g('piie-x', 'Peterson Institute', 'piie.com', ['trade', 'economics'], 'us'),
  g('mercatus', 'Mercatus Center', 'mercatus.org', ['economics', 'us', 'regulation'], 'us'),
  g('aei-x', 'AEI', 'aei.org', ['us', 'conservative', 'economics'], 'us'),
  g('heritage-x', 'Heritage Foundation', 'heritage.org', ['us', 'conservative'], 'us'),
  g('voxeu', 'VoxEU', 'voxeu.org', ['economics', 'research', 'policy'], 'eu'),
  g('cepr', 'CEPR', 'cepr.org', ['economics', 'research', 'eu'], 'eu'),
  g('wider-x', 'UNU-WIDER', 'wider.unu.edu', ['development', 'inequality']),
  g('iza', 'IZA Institute of Labor Economics', 'iza.org', ['labour', 'economics'], 'eu'),
  d('epi', 'Economic Policy Institute', 'https://www.epi.org/feed/', ['labour', 'wages', 'us'], 'us'),
  g('roosevelt', 'Roosevelt Institute', 'rooseveltinstitute.org', ['economics', 'us', 'progressive'], 'us'),
  g('iif', 'Institute of International Finance', 'iif.com', ['finance', 'banking', 'emerging-markets'], 'us'),
  g('grp', 'Global Risk Institute', 'globalriskinstitute.org', ['risk', 'finance'], 'us'),
  g('wri', 'World Resources Institute', 'wri.org', ['environment', 'climate', 'cities']),
  g('rff', 'Resources for the Future', 'rff.org', ['energy', 'environment', 'economics'], 'us'),
  g('catq', 'Clean Air Task Force', 'catf.us', ['climate', 'energy', 'methane'], 'us'),
  { url: 'https://www.carbonbrief.org/feed', provider: 'carbonbrief', issuer: 'Carbon Brief', type: 'analysis', domains: ['climate', 'energy', 'data'], region: 'eu', direct: true },
  g('climateanalytics-x', 'Climate Analytics', 'climateanalytics.org', ['climate', 'policy'], 'eu'),
  g('newclimate', 'NewClimate Institute', 'newclimate.org', ['climate', 'policy'], 'eu'),
  g('wem', 'Woodwell Climate', 'woodwellclimate.org', ['climate', 'science'], 'us'),
  g('iisd', 'IISD', 'iisd.org', ['sustainability', 'trade', 'climate']),
  g('secresearch', 'Stockholm Environment Institute', 'sei.org', ['environment', 'climate'], 'eu'),
  g('weforum-agenda', 'WEF Agenda', 'weforum.org', ['economics', 'foresight']),
  // Science media (verified direct feeds)
  { url: 'https://www.sciencedaily.com/rss/top/science.xml', provider: 'sciencedaily', issuer: 'ScienceDaily', type: 'news', domains: ['science', 'research', 'health'], region: 'global', direct: true },
  { url: 'https://www.nature.com/nature.rss', provider: 'nature-news', issuer: 'Nature News', type: 'news', domains: ['science', 'research'], region: 'global', direct: true },
  { url: 'https://www.science.org/rss/news_current.xml', provider: 'science-news', issuer: 'Science News', type: 'news', domains: ['science', 'research'], region: 'us', direct: true },
  { url: 'https://phys.org/rss-feed/', provider: 'phys', issuer: 'Phys.org', type: 'news', domains: ['science', 'tech', 'space'], region: 'global', direct: true },
  { url: 'https://www.livescience.com/feeds/all', provider: 'livescience', issuer: 'Live Science', type: 'news', domains: ['science', 'health'], region: 'us', direct: true },
  { url: 'https://carbontracker.org/feed/', provider: 'carbontracker', issuer: 'Carbon Tracker Initiative', type: 'analysis', domains: ['climate', 'energy', 'finance'], region: 'eu', direct: true },
  { url: 'https://reliefweb.int/rss.xml', provider: 'reliefweb', issuer: 'ReliefWeb (OCHA)', type: 'report', domains: ['humanitarian', 'disaster', 'conflict', 'development'], region: 'global', direct: true },
];

/**
 * Civil society, transparency & watchdogs — ~40 sources.
 */
export const CIVIL_SOCIETY_FEEDS: FeedSource[] = [
  g('icij', 'ICIJ', 'icij.org', ['investigation', 'corruption', 'offshore']),
  g('occrp', 'OCCRP', 'occrp.org', ['corruption', 'organized-crime', 'investigation']),
  g('bellingcat', 'Bellingcat', 'bellingcat.com', ['osint', 'investigation', 'conflict']),
  g('globalwitness', 'Global Witness', 'globalwitness.org', ['corruption', 'environment', 'resources']),
  g('hrw-x', 'Human Rights Watch', 'hrw.org', ['human-rights', 'conflict']),
  g('amnesty-x', 'Amnesty International', 'amnesty.org', ['human-rights']),
  g('freedomhouse-x', 'Freedom House', 'freedomhouse.org', ['democracy', 'freedom', 'authoritarianism']),
  g('article19', 'Article 19', 'article19.org', ['free-speech', 'digital-rights']),
  g('eff', 'EFF', 'eff.org', ['digital-rights', 'privacy', 'surveillance'], 'us'),
  g('access-now', 'Access Now', 'accessnow.org', ['digital-rights', 'internet-shutdowns']),
  g('edri', 'EDRi', 'edri.org', ['digital-rights', 'eu', 'privacy'], 'eu'),
  g('privacy-int', 'Privacy International', 'privacyinternational.org', ['privacy', 'surveillance'], 'eu'),
  g('cihr', 'CIVICUS', 'civicus.org', ['civil-society', 'freedom']),
  g('international-alert', 'International Alert', 'international-alert.org', ['peacebuilding', 'conflict']),
  d('icg-x', 'International Crisis Group', 'https://www.crisisgroup.org/rss.xml', ['conflict', 'geopolitics']),
  g('carter', 'Carter Center', 'cartercenter.org', ['elections', 'democracy', 'health'], 'us'),
  g('ndi', 'National Democratic Institute', 'ndi.org', ['democracy', 'elections'], 'us'),
  g('idea-int', 'International IDEA', 'idea.int', ['democracy', 'elections', 'constitutions']),
  g('vnarchive', 'Verified Voting', 'verifiedvoting.org', ['elections', 'voting-tech'], 'us'),
  g('controlrisks', 'Control Risks', 'controlrisks.com', ['risk', 'security', 'business']),
  g('verisk', 'Verisk Maplecroft', 'maplecroft.com', ['risk', 'esg', 'geopolitics'], 'eu'),
  g('economist-eiu', 'EIU', 'eiu.com', ['country-risk', 'forecasting', 'economics'], 'eu'),
  g('oxford-analytica', 'Oxford Analytica', 'oxan.com', ['geopolitics', 'analysis', 'forecasting'], 'eu'),
  g('stratfor', 'RANE/Stratfor', 'worldview.stratfor.com', ['geopolitics', 'intelligence'], 'us'),
  g('geopolitical-futures', 'Geopolitical Futures', 'geopoliticalfutures.com', ['geopolitics', 'forecasting'], 'us'),
  g('foreignbrief', 'Foreign Brief', 'foreignbrief.com', ['geopolitics', 'daily-brief']),
  g('intelbrief', 'Soufan Center', 'thesoufancenter.org', ['security', 'terrorism', 'intelligence'], 'us'),
  g('ctc', 'CTC Sentinel (West Point)', 'ctc.westpoint.edu', ['terrorism', 'security'], 'us'),
  g('tandfonline-tweets', 'ICCT The Hague', 'icct.nl', ['terrorism', 'counter-terrorism'], 'eu'),
  g('rusi', 'RUSI', 'rusi.org', ['defense', 'uk', 'security'], 'eu'),
  g('iiss-x', 'IISS', 'iiss.org', ['defense', 'strategy', 'geopolitics'], 'eu'),
  g('iss-europa', 'EU ISS', 'iss.europa.eu', ['eu', 'security'], 'eu'),
  d('gmfus-x', 'German Marshall Fund', 'https://www.gmfus.org/rss.xml', ['transatlantic', 'us', 'eu'], 'us'),
  g('aspenu', 'Aspen Institute', 'aspeninstitute.org', ['us', 'ideas', 'policy'], 'us'),
  d('atlanticcouncil-x', 'Atlantic Council', 'https://www.atlanticcouncil.org/feed/', ['geopolitics', 'nato', 'us'], 'us'),
  g('pew-x', 'Pew Trusts', 'pewtrusts.org', ['us', 'policy', 'states'], 'us'),
  g('commonwealth', 'Commonwealth Fund', 'commonwealthfund.org', ['health', 'us', 'policy'], 'us'),
  g('kff', 'KFF', 'kff.org', ['health', 'us', 'policy'], 'us'),
  g('migration-uk', 'Migration Observatory', 'migrationobservatory.ox.ac.uk', ['migration', 'uk'], 'eu'),
  g('mcgill-cdnpoli', 'Max Bell School', 'mcgill.ca', ['canada', 'policy'], 'us'),
];
