/**
 * ORCID client for author identity enrichment
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export interface ORCIDData {
  orcid: string;
  name: string;
  otherNames?: string[];
  biography?: string;
  affiliations?: string[];
  raw: any;
}

export async function getORCIDById(orcid: string): Promise<ORCIDData | null> {
  const cleanOrcid = orcid.replace("https://orcid.org/", "");
  const base = env.ORCID_API;
  const url = `${base}/${cleanOrcid}/person`;
  
  try {
    const data = await fetchFromProvider<any>("orcid", url, { timeout: 10000 });
    
    return {
      orcid: data['orcid-identifier']?.path,
      name: data.person?.name?.['given-names'] + ' ' + data.person?.name?.['family-name'],
      otherNames: data.person?.['other-names']?.['other-name']?.map((n: any) => n.content),
      biography: data.person?.biography?.content,
      affiliations: data.person?.employments?.['employment-summary']?.map((e: any) => e['organization-name']),
      raw: data
    };
  } catch (error) {
    console.warn(`ORCID lookup failed for ${orcid}:`, error);
    return null;
  }
}

// Legacy export for backward compatibility
export async function searchOrcid(orcid: string) {
  return getORCIDById(orcid);
}
