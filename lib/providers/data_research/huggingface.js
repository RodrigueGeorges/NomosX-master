/**
 * Hugging Face Provider - Models & Datasets API
 */

export async function searchHuggingFace(query, limit = 100) {
  try {
    const response = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${limit}`);
    const data = await response.json();
    
    return data.map((item) => ({
      id: item.id,
      provider: "huggingface",
      type: "model",
      title: item.modelId,
      abstract: item.description,
      authors: [{ name: item.author || "Unknown", institution: "Hugging Face" }],
      journal: "Hugging Face Model",
      year: new Date(item.created_at).getFullYear(),
      doi: null,
      url: `https://huggingface.co/${item.modelId}`,
      trustScore: Math.min(item.downloads / 10000, 1),
      raw: item
    }));
  } catch (error) {
    console.error('HuggingFace search failed:', error);
    return [];
  }
}

// Legacy export for backward compatibility
export async function searchHuggingface(query, limit = 100) {
  return searchHuggingFace(query, limit);
}

export default { searchHuggingFace, searchHuggingface };
