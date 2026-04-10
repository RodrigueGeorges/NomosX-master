export interface PublicationService {
  createPublication(data: any): Promise<any>;
  getPublications(filters?: any): Promise<any[]>;
  updatePublication(id: string, data: any): Promise<any>;
  deletePublication(id: string): Promise<void>;
}

export class PublicationServiceImpl implements PublicationService {
  async createPublication(data: any) {
    const response = await fetch('/api/publications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async getPublications(filters?: any) {
    const query = filters ? new URLSearchParams(filters).toString() : '';
    const response = await fetch(`/api/publications?${query}`);
    return response.json();
  }

  async updatePublication(id: string, data: any) {
    const response = await fetch(`/api/publications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async deletePublication(id: string) {
    await fetch(`/api/publications/${id}`, { method: 'DELETE' });
  }
}

export const publicationService = new PublicationServiceImpl();