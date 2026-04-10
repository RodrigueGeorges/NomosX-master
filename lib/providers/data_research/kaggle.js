/**
 * Kaggle Provider - Datasets API
 */

export async function searchKaggle(query, limit = 100) {
  try {
    const response = await fetch(`https://www.kaggle.com/api/v1/datasets?search=${encodeURIComponent(query)}&size=${limit}`);
    const data = await response.json();
    
    return data.datasets.map((item) => ({
      id: item.id.toString(),
      title: item.title,
      authors: [item.creatorName],
      year: new Date(item.lastUpdated).getFullYear(),
      doi: null,
      abstract: item.description,
      url: item.url,
      source: 'Kaggle',
      provider: 'kaggle',
      qualityScore: 75,
      type: 'dataset'
    }));
  } catch (error) {
    console.error('Kaggle API error:', error);
    return [];
  }
}

export default { searchKaggle };
