/**
 * Figshare Provider - Data Repository API
 */

export async function searchFigshare(query, limit = 100) {
  try {
    const response = await fetch(`https://api.figshare.com/v2/articles/search?q=${encodeURIComponent(query)}&page_size=${limit}`);
    const data = await response.json();
    
    return data.map((item) => ({
      id: item.id.toString(),
      title: item.title,
      authors: item.authors?.map((a) => a.full_name) || [],
      year: new Date(item.published_date).getFullYear(),
      doi: item.doi,
      abstract: item.description,
      url: item.url,
      source: 'Figshare',
      provider: 'figshare',
      qualityScore: 80,
      type: 'dataset'
    }));
  } catch (error) {
    console.error('Figshare API error:', error);
    return [];
  }
}

export default { searchFigshare };
