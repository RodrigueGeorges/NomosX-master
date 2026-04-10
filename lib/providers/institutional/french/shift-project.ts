/**
 * The Shift Project - French climate & energy think tank
 * Uses OpenAlex enriched keyword search (limited academic indexing)
 * + Sciences Po Paris ROR as proxy: 03xez6b38
 */

import { searchOpenAlex } from '../../openalex';

export async function searchShiftProject(query: string, limit = 15): Promise<any[]> {
  console.log(`[ShiftProject] Searching for: "${query}"`);
  try {
    const results = await searchOpenAlex(
      `${query} energy transition decarbonization climate shift project`,
      limit,
      { filter: 'concepts.id:C127313418' } // Climate change concept
    );
    const mapped = results.map(r => ({
      ...r,
      id: `shift-project:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'shift-project',
      issuer: 'The Shift Project',
      issuerType: 'think_tank',
    }));
    console.log(`[ShiftProject] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ShiftProject] Search failed: ${error.message}`);
    return [];
  }
}
