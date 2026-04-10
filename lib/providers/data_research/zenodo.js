/**
 * Zenodo Provider - Research Data API
 */

export async function searchZenodo(query, limit = 100) {
  try {
    const response = await fetch(`https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=${limit}`);
    const data = await response.json();
    
    return data.hits.hits.map((hit) => ({
      id: hit.id,
      title: hit.metadata.title,
      authors: hit.metadata.creators?.map((c) => c.name) || [],
      year: new Date(hit.metadata.publication_date).getFullYear(),
      doi: hit.metadata.doi,
      abstract: hit.metadata.description,
      url: hit.links.self,
      source: 'Zenodo',
      provider: 'zenodo',
      qualityScore: 85,
      type: 'dataset'
    }));
  } catch (error) {
    console.error('Zenodo API error:', error);
    return [];
  }
}

export default { searchZenodo };
