
export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Accept": "application/json", ...(init?.headers || {}) } });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText} :: ${text.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}
