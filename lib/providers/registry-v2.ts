/**
 * PROVIDER REGISTRY V2 - Contrat unifié
 * Systeme unifié pour tous les providers avec diagnostics
 */

export interface ProviderDiagnostics {
  providerId: string;
  retrievedAt: Date;
  latencyMs: number;
  items: number;
  warnings: string[];
  blockedReason?: string;
  rateLimited?: boolean;
  error?: string;
}

export interface SourceCandidate {
  id: string;
  provider: string;
  type: 'publication' | 'dataset' | 'patent' | 'report' | 'preprint';
  title: string;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  year: number;
  publishedDate?: string;
  authors: Array<{ name: string; orcid?: string; institution?: string }>;
  citationCount?: number;
  qualityScore: number;
  noveltyScore: number;
  documentType: string;
  issuer: string;
  issuerType: 'academic' | 'government' | 'corporate' | 'patent-office' | 'think-tank';
  classification: string;
  language: string;
  contentFormat: 'json' | 'xml' | 'html' | 'pdf' | 'text';
  oaStatus: 'open' | 'closed' | 'unknown';
  hasFullText: boolean;
  raw: any;
}

export interface ProviderResult {
  success: boolean;
  items: SourceCandidate[];
  diagnostics: ProviderDiagnostics;
  hasMore?: boolean;
  nextCursor?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  category: 'academic' | 'institutional' | 'business' | 'patents' | 'data' | 'think-tanks' | 'intelligence';
  priority: number;
  method: 'api-official' | 'api-third-party' | 'scraping-smart' | 'rss' | 'search-engine';
  reliability: number; // 0-100
  cost: number; // $ per 1000 requests
  rateLimit: number; // ms between requests
  requiresAuth: boolean;
  authEnvVar?: string;
  enabled: boolean;
  healthCheckUrl?: string;
  lastHealthCheck?: Date;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
}

/**
 * Provider Registry V2
 * Central registry for all providers with unified interface
 */
export class ProviderRegistryV2 {
  private static instance: ProviderRegistryV2;
  private providers: Map<string, ProviderConfig> = new Map();
  private healthCache: Map<string, { status: string; checkedAt: Date }> = new Map();

  static getInstance(): ProviderRegistryV2 {
    if (!ProviderRegistryV2.instance) {
      ProviderRegistryV2.instance = new ProviderRegistryV2();
    }
    return ProviderRegistryV2.instance;
  }

  /**
   * Register a provider with its configuration
   */
  register(config: ProviderConfig): void {
    this.providers.set(config.id, config);
  }

  /**
   * Get provider configuration
   */
  getConfig(providerId: string): ProviderConfig | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers by category
   */
  getByCategory(category: string): ProviderConfig[] {
    return Array.from(this.providers.values())
      .filter(p => p.category === category)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get providers by reliability threshold
   */
  getReliable(minReliability = 80): ProviderConfig[] {
    return Array.from(this.providers.values())
      .filter(p => p.reliability >= minReliability && p.enabled)
      .sort((a, b) => b.reliability - a.reliability);
  }

  /**
   * Get providers requiring authentication
   */
  getAuthRequired(): Array<{ provider: string; envVar: string }> {
    return Array.from(this.providers.values())
      .filter(p => p.requiresAuth && p.authEnvVar)
      .map(p => ({ provider: p.id, envVar: p.authEnvVar! }));
  }

  /**
   * Health check for a provider
   */
  async healthCheck(providerId: string): Promise<{ status: string; latency: number; error?: string }> {
    const config = this.getConfig(providerId);
    if (!config || !config.enabled) {
      return { status: 'disabled', latency: 0 };
    }

    // Check cache first (5 min TTL)
    const cached = this.healthCache.get(providerId);
    if (cached && Date.now() - cached.checkedAt.getTime() < 5 * 60 * 1000) {
      return { status: cached.status, latency: 0 };
    }

    const startTime = Date.now();
    
    try {
      if (config.healthCheckUrl) {
        const response = await fetch(config.healthCheckUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000)
        });
        
        const latency = Date.now() - startTime;
        const status = response.ok ? 'healthy' : 'degraded';
        
        this.healthCache.set(providerId, { status, checkedAt: new Date() });
        return { status, latency };
      } else {
        // No health check URL - assume healthy
        this.healthCache.set(providerId, { status: 'healthy', checkedAt: new Date() });
        return { status: 'healthy', latency: Date.now() - startTime };
      }
    } catch (error: any) {
      const status = error.name === 'AbortError' ? 'timeout' : 'down';
      this.healthCache.set(providerId, { status, checkedAt: new Date() });
      return { status, latency: Date.now() - startTime, error: error.message };
    }
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Map<string, { status: string; latency: number; error?: string }>> {
    const results = new Map();
    
    await Promise.allSettled(
      Array.from(this.providers.keys()).map(async (providerId) => {
        const result = await this.healthCheck(providerId);
        results.set(providerId, result);
      })
    );
    
    return results;
  }

  /**
   * Execute provider with unified interface and diagnostics
   */
  async execute(
    providerId: string, 
    query: string, 
    limit = 15
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    const config = this.getConfig(providerId);
    
    if (!config) {
      return {
        success: false,
        items: [],
        diagnostics: {
          providerId,
          retrievedAt: new Date(),
          latencyMs: Date.now() - startTime,
          items: 0,
          warnings: ['Provider not found'],
          blockedReason: 'not_found'
        }
      };
    }

    if (!config.enabled) {
      return {
        success: false,
        items: [],
        diagnostics: {
          providerId,
          retrievedAt: new Date(),
          latencyMs: Date.now() - startTime,
          items: 0,
          warnings: ['Provider disabled'],
          blockedReason: 'disabled'
        }
      };
    }

    try {
      // Import and execute provider function dynamically
      const providerFunction = await this.loadProviderFunction(providerId);
      const rawResults = await providerFunction(query, limit);
      
      const latency = Date.now() - startTime;
      
      // Normalize results to SourceCandidate format
      const items = this.normalizeResults(rawResults);
      
      return {
        success: true,
        items,
        diagnostics: {
          providerId,
          retrievedAt: new Date(),
          latencyMs: latency,
          items: items.length,
          warnings: [],
          rateLimited: false
        }
      };
      
    } catch (error: any) {
      return {
        success: false,
        items: [],
        diagnostics: {
          providerId,
          retrievedAt: new Date(),
          latencyMs: Date.now() - startTime,
          items: 0,
          warnings: [error.message],
          error: error.message,
          blockedReason: error.name === 'TimeoutError' ? 'timeout' : 'error'
        }
      };
    }
  }

  /**
   * Load provider function dynamically
   */
  private async loadProviderFunction(providerId: string): Promise<(query: string, limit: number) => Promise<any[]>> {
    // This would be implemented based on your provider structure
    // For now, return a placeholder
    throw new Error(`Provider function not implemented for ${providerId}`);
  }

  /**
   * Normalize raw provider results to SourceCandidate format
   */
  private normalizeResults(rawResults: any[]): SourceCandidate[] {
    return rawResults.map(item => ({
      id: item.id || `${Date.now()}-${Math.random()}`,
      provider: item.provider || 'unknown',
      type: item.type || 'publication',
      title: item.title || 'Untitled',
      abstract: item.abstract,
      url: item.url || '',
      pdfUrl: item.pdfUrl,
      year: item.year || new Date().getFullYear(),
      publishedDate: item.publishedDate,
      authors: item.authors || [],
      citationCount: item.citationCount,
      qualityScore: item.qualityScore || 50,
      noveltyScore: item.noveltyScore || 50,
      documentType: item.documentType || 'publication',
      issuer: item.issuer || 'Unknown',
      issuerType: item.issuerType || 'academic',
      classification: item.classification || 'general',
      language: item.language || 'en',
      contentFormat: item.contentFormat || 'text',
      oaStatus: item.oaStatus || 'unknown',
      hasFullText: item.hasFullText || false,
      raw: item
    }));
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    byCategory: Record<string, number>;
    byMethod: Record<string, number>;
    avgReliability: number;
  } {
    const providers = Array.from(this.providers.values());
    
    return {
      total: providers.length,
      enabled: providers.filter(p => p.enabled).length,
      byCategory: providers.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byMethod: providers.reduce((acc, p) => {
        acc[p.method] = (acc[p.method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avgReliability: providers.reduce((sum, p) => sum + p.reliability, 0) / providers.length
    };
  }
}

// Export singleton instance
export const providerRegistry = ProviderRegistryV2.getInstance();
