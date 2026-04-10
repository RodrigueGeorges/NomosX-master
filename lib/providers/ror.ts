/**
 * ROR (Research Organization Registry) client
 * Enriches institution metadata with canonical IDs
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export interface RORData {
  id: string;
  name: string;
  country?: string;
  type?: string;
  acronyms?: string[];
  aliases?: string[];
  raw: any;
}

export async function searchROR(query: string): Promise<RORData[]> {
  const base = env.ROR_API;
  const url = `${base}?query=${encodeURIComponent(query)}`;
  
  try {
    const data: any = await fetchFromProvider("ror", url, { timeout: 10000, retries: 2 });
    const items = data?.items || [];
    
    return items.slice(0, 5).map((org: any) => ({
      id: org.id?.replace("https://ror.org/", "") || "",
      name: org.name || "",
      country: org.country?.country_name || null,
      type: org.types?.[0] || null,
      acronyms: org.acronyms || [],
      aliases: org.aliases || [],
      raw: org,
    }));
  } catch (error: any) {
    console.error(`[ROR] Search failed for "${query}": ${error.message}`);
    return [];
  }
}

export async function getRORById(rorId: string): Promise<RORData | null> {
  const cleanId = rorId.replace("https://ror.org/", "");
  const url = `https://api.ror.org/organizations/${cleanId}`;
  
  try {
    const org: any = await fetchFromProvider("ror", url, { timeout: 10000, retries: 2 });
    
    return {
      id: cleanId,
      name: org.name || "",
      country: org.country?.country_name || null,
      type: org.types?.[0] || null,
      acronyms: org.acronyms || [],
      aliases: org.aliases || [],
      raw: org,
    };
  } catch (error: any) {
    console.error(`[ROR] Fetch by ID failed for ${cleanId}: ${error.message}`);
    return null;
  }
}
