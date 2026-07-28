/**
 * ClinicalTrials.gov — Clinical trials registry
 * API: https://clinicaltrials.gov/api/v2/studies (free, no key)
 * 500K+ clinical trials with detailed protocols and results
 */

import axios from 'axios';

const CT_API = 'https://clinicaltrials.gov/api/v2/studies';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchClinicalTrials(query: string, limit = 15): Promise<any[]> {
  console.log(`[ClinicalTrials] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Extract health-relevant terms from query — ClinicalTrials.gov is medical
    const healthKeywords = query.toLowerCase()
      .split(/\s+/)
      .filter(w => ['ai', 'health', 'medical', 'medicine', 'clinical', 'disease', 'treatment',
        'therapy', 'drug', 'vaccine', 'cancer', 'patient', 'diagnosis', 'mental', 'cognitive',
        'energy', 'nutrition', 'sleep', 'stress', 'environment', 'pollution', 'climate'].includes(w));
    const searchTerm = healthKeywords.length > 0
      ? healthKeywords.join(' ')
      : 'artificial intelligence'; // fallback to broad AI term

    const { data } = await axios.get(CT_API, {
      params: {
        'query.term': searchTerm,
        pageSize: limit,
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const studies = data?.studies ?? [];
    for (const study of studies.slice(0, limit)) {
      const protocol = study?.protocolSection ?? {};
      const idModule = protocol?.identificationModule ?? {};
      const descModule = protocol?.descriptionModule ?? {};
      const statusModule = protocol?.statusModule ?? {};
      const designModule = protocol?.designModule ?? {};

      sources.push({
        id: `clinical-trials:${idModule.nctId}`,
        provider: 'clinical-trials',
        type: 'clinical-trial',
        title: idModule.officialTitle ?? idModule.briefTitle ?? '',
        abstract: descModule.briefSummary?.slice(0, 2000) ?? '',
        authors: (protocol?.sponsorCollaboratorsModule?.leadSponsor ? [protocol.sponsorCollaboratorsModule.leadSponsor.name] : []),
        url: `https://clinicaltrials.gov/study/${idModule.nctId}`,
        pdfUrl: null,
        year: statusModule.startDateStruct?.date ? new Date(statusModule.startDateStruct.date).getFullYear() : null,
        publishedDate: statusModule.startDateStruct?.date ? new Date(statusModule.startDateStruct.date) : null,
        venue: 'ClinicalTrials.gov',
        issuer: 'ClinicalTrials.gov (NIH)',
        issuerType: 'government',
        language: 'en',
        oaStatus: 'open',
        hasFullText: false,
        topics: ['clinical-trial', 'medicine', 'research'],
        raw: {
          source: 'clinical-trials',
          nctId: idModule.nctId,
          status: statusModule.overallStatus,
          phase: designModule.phases,
          studyType: designModule.studyType,
        },
      });
    }

    console.log(`[ClinicalTrials] Found ${sources.length} trials`);
  } catch (error: any) {
    console.error(`[ClinicalTrials] Search failed: ${error.message}`);
  }

  return sources;
}
