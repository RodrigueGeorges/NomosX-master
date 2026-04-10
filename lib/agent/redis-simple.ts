/**
 * NomosX REDIS CONFIGURATION - Simplified Version
 * Configuration Redis simplifiée pour éviter les erreurs de compatibilité
 */

import Redis from 'ioredis';

// ============================================================================
// CONFIGURATION REDIS SIMPLIFIÉE
// ============================================================================

export interface SimpleRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export const simpleRedisConfig: SimpleRedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'nomosx:',
};

// ============================================================================
// REDIS CLIENT MANAGER SIMPLIFIÉ
// ============================================================================

export class SimpleRedisManager {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private permanentlyDisabled: boolean = false;
  private disabledLogged: boolean = false;
  
  constructor(private config: SimpleRedisConfig) {
    // FAIL-FAST: If no Redis env vars at all, disable permanently — zero retries
    const hasRedisConfig = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || process.env.REDIS_HOST);
    if (!hasRedisConfig) {
      this.permanentlyDisabled = true;
      return; // Skip graceful shutdown setup — nothing to shut down
    }
    this.setupGracefulShutdown();
  }
  
  /**
   * Crée et connecte le client Redis
   */
  async connect(): Promise<Redis> {
    if (this.permanentlyDisabled) {
      throw new Error('Redis permanently disabled — no config');
    }
    if (this.client && this.isConnected) {
      return this.client;
    }
    
    try {
      const retryStrategy = (times: number) => {
        this.connectionAttempts = times;
        if (times > this.maxConnectionAttempts) {
          console.warn(`[Redis] Max connection attempts (${this.maxConnectionAttempts}) reached`);
          return null;
        }
        const delay = Math.min(times * 1000, 10000);
        console.log(`[Redis] Connection attempt ${times}, retrying in ${delay}ms`);
        return delay;
      };

      // P1-FIX: Try Upstash first (preferred for serverless), then REDIS_URL, then host/port
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        this.client = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
          password: process.env.UPSTASH_REDIS_REST_TOKEN,
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 5000,
          commandTimeout: 3000,
          keyPrefix: this.config.keyPrefix,
          retryStrategy,
        });
        console.log('[Redis] Using Upstash connection');
      } else if (process.env.REDIS_URL) {
        this.client = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 5000,
          commandTimeout: 3000,
          keyPrefix: this.config.keyPrefix,
          retryStrategy,
        });
        console.log('[Redis] Using REDIS_URL connection');
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 5000,
          commandTimeout: 3000,
          keyPrefix: this.config.keyPrefix,
          retryStrategy,
        });
        console.log('[Redis] Using host/port connection');
      }
      
      // Event listeners
      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });
      
      this.client.on('ready', () => {
        console.log('[Redis] Ready for commands');
      });
      
      this.client.on('error', (err: Error) => {
        this.isConnected = false;
        console.error('[Redis] Connection error:', err.message);
      });
      
      this.client.on('close', () => {
        this.isConnected = false;
        console.warn('[Redis] Connection closed');
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });
      
      return this.client;
      
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error);
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }
  
  /**
   * Programme une reconnexion automatique
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(async () => {
      if (!this.isShuttingDown && !this.isConnected) {
        console.log('[Redis] Attempting automatic reconnection...');
        try {
          await this.connect();
        } catch (error) {
          console.error('[Redis] Auto-reconnection failed:', error);
        }
      }
    }, 5000); // Reconnect after 5 seconds
  }
  
  /**
   * Configuration du graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      this.isShuttingDown = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      await this.disconnect();
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
  
  /**
   * Vérifie si Redis est connecté
   */
  isRedisConnected(): boolean {
    if (this.permanentlyDisabled) {
      if (!this.disabledLogged) {
        console.log('[Redis] No Redis configured — caching disabled (fail-fast)');
        this.disabledLogged = true;
      }
      return false;
    }
    return this.isConnected && this.client !== null;
  }
  
  /**
   * Cache une valeur avec TTL (avec retry et fallback)
   */
  async setWithTTL(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    if (this.permanentlyDisabled) return false;
    if (!this.isRedisConnected()) return false;
    
    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      console.error('[Redis] Failed to set with TTL:', error);
      // Mark as disconnected on error
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Récupère une valeur du cache (avec retry)
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.permanentlyDisabled) return null;
    if (!this.isRedisConnected()) return null;
    
    try {
      const value = await this.client!.get(key);
      if (value === null) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('[Redis] Failed to get value:', error);
      this.isConnected = false;
      return null;
    }
  }
  
  /**
   * Tentative de reconnexion — single attempt, no backoff
   */
  private async attemptReconnect(): Promise<void> {
    if (this.isShuttingDown || this.permanentlyDisabled) return;
    try {
      await this.connect();
    } catch {
      // Single attempt failed — will retry on next scheduleReconnect
    }
  }
  
  /**
   * Supprime une clé du cache
   */
  async delete(key: string): Promise<boolean> {
    if (this.permanentlyDisabled || !this.isRedisConnected()) {
      return false;
    }
    
    try {
      const result = await this.client!.del(key);
      return result > 0;
    } catch (error) {
      console.error('[Redis] Failed to delete key:', error);
      return false;
    }
  }
  
  /**
   * Scan les clés avec un pattern
   */
  async scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    if (this.permanentlyDisabled || !this.isRedisConnected()) {
      return [];
    }
    
    const allKeys: string[] = [];
    let cursor = '0';
    
    do {
      try {
        const [nextCursor, keys] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', count);
        cursor = nextCursor;
        allKeys.push(...keys);
      } catch (error) {
        console.error('[Redis] Scan error:', error);
        break;
      }
    } while (cursor !== '0');
    
    return allKeys;
  }
  
  /**
   * Ferme la connexion Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('[Redis] Disconnected');
    }
  }
}

// ============================================================================
// UTILITAIRES DE CACHE SIMPLIFIÉS
// ============================================================================

export class SimpleCacheUtils {
  private static readonly DEFAULT_TTL = 3600; // 1 heure
  
  /**
   * Cache une requête SCOUT
   */
  static async cacheScoutQuery(
    query: string, 
    providers: string[], 
    results: any[], 
    ttl: number = this.DEFAULT_TTL
  ): Promise<boolean> {
    const key = this.generateScoutKey(query, providers);
    return await simpleRedisManager.setWithTTL(key, results, ttl);
  }
  
  /**
   * Récupère une requête SCOUT du cache
   */
  static async getCachedScoutQuery(query: string, providers: string[]): Promise<any[] | null> {
    const key = this.generateScoutKey(query, providers);
    return await simpleRedisManager.get<any[]>(key);
  }
  
  /**
   * Génère une clé de cache pour SCOUT
   */
  private static generateScoutKey(query: string, providers: string[]): string {
    const providersStr = providers.sort().join(',');
    const hash = Buffer.from(`${query}|${providersStr}`).toString('base64').replace(/[+/=]/g, '');
    return `scout:${hash}`;
  }
}

// ============================================================================
// INSTANCE GLOBALE
// ============================================================================

export const simpleRedisManager = new SimpleRedisManager(simpleRedisConfig);
