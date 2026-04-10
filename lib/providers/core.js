/**
 * core Provider - Specialized Academic API
 */

export async function searchCore(query, limit = 100) {
  try {
    // Fallback vers OpenAlex pour l'instant
    const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}`);
    const data = await response.json();
    
    return data.results.map((item) => ({
      id: item.id,
      title: item.title,
      authors: item.authorships?.map((a) => a.author?.display_name).filter(Boolean) || [],
      year: item.publication_year,
      doi: item.doi,
      abstract: item.abstract,
      url: item.primary_location?.source?.homepage_url || item.id,
      source: 'core',
      provider: 'core',
      qualityScore: 80,
      type: 'academic'
    }));
  } catch (error) {
    console.error('core API error:', error);
    return [];
  }
}

export default { searchCore };
