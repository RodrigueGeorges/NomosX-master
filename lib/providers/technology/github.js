/**
 * GitHub Provider - Real API Implementation
 */

export async function searchGitHub(query, limit = 100) {
  try {
    const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`);
    const data = await response.json();
    
    return data.items.map((item) => ({
      id: item.id,
      provider: "github",
      type: "repository",
      title: item.name,
      abstract: item.description,
      authors: [{ name: item.owner.login, institution: "GitHub" }],
      journal: "GitHub Repository",
      year: new Date(item.created_at).getFullYear(),
      doi: null,
      url: item.html_url,
      trustScore: Math.min(item.stargazers_count / 1000, 1),
      raw: item
    }));
  } catch (error) {
    console.error('GitHub search failed:', error);
    return [];
  }
}

// Legacy export for backward compatibility
export async function searchGithub(query, limit = 100) {
  return searchGitHub(query, limit);
}

export default { searchGitHub, searchGithub };
