/**
 * NomosX REDIS CONFIGURATION - Optimized Caching System
 * 
 * Configuration améliorée pour Redis avec:
 * - Reconnection automatique
 * - Gestion d'erreurs robuste
 * - Stratégies de cache optimisées
 * - Monitoring et métriques
 */

import Redis from 'ioredis';

// ============================================================================
// CONFIGURATION REDIS
// ============================================================================

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  enableReadyCheck?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
  maxMemoryPolicy?: string;
  keyPrefix?: string;
}

export const redisConfig: RedisConfig = {
  // Configuration depuis environnement ou valeurs par défaut
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Retry et reconnection
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: false,
  connectTimeout: 10000,
  commandTimeout: 5000,
  
  // Memory management
  maxMemoryPolicy: 'allkeys-lru',
  keyPrefix: 'nomosx:',
};

// ============================================================================
// REDIS CLIENT MANAGER
// ============================================================================

export class RedisManager {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds
  
  constructor(private config: RedisConfig) {}
  
  /**
   * Crée et configure le client Redis
   */
  async connect(): Promise<Redis> {
    if (this.client && this.isConnected) {
      return this.client;
    }
    
    try {
      // Create client first
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        lazyConnect: this.config.lazyConnect,
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
        keyPrefix: this.config.keyPrefix,
        
        // Retry strategy personnalisée
        retryStrategy: (times: number) => {
          this.connectionAttempts = times;
          
          // Arrêter de réessayer après max tentatives
          if (times > this.maxConnectionAttempts) {
            console.warn(`[Redis] Max connection attempts (${this.maxConnectionAttempts}) reached`);
            return null;
          }
          
          // Délai exponentiel avec jitter
          const delay = Math.min(times * 1000, 30000) + Math.random() * 1000;
          console.log(`[Redis] Connection attempt ${times}, retrying in ${Math.round(delay)}ms`);
          return delay;
        },
        
        // Gestion des erreurs
        reconnectOnError: (err: Error) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true; // Reconnecter sur erreur READONLY
          }
          return false;
        },
      });
      
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
        
        // Ne logger que la première erreur pour éviter le spam
        if (this.connectionAttempts === 1) {
          console.warn('[Redis] Cache will be disabled until reconnection');
        }
      });
      
      this.client.on('close', () => {
        this.isConnected = false;
        console.warn('[Redis] Connection closed');
      });
      
      this.client.on('reconnecting', () => {
        console.log('[Redis] Attempting to reconnect...');
      });
      
      // Tentative de connexion (si lazyConnect est false)
      if (!this.config.lazyConnect) {
        await this.client.connect();
      }
      
      return this.client;
      
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error);
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }
  
  /**
   * Vérifie si Redis est connecté
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.client !== null;
  }
  
  /**
   * Exécute une commande Redis avec gestion d'erreurs
   */
  async executeCommand<T>(command: string, ...args: any[]): Promise<T | null> {
    if (!this.isRedisConnected()) {
      console.warn(`[Redis] Not connected, skipping ${command} command`);
      return null;
    }
    
    try {
      const result = await this.client!.call(command, ...args);
      return result as T;
    } catch (error) {
      console.error(`[Redis] Command ${command} failed:`, error);
      return null;
    }
  }
  
  /**
   * Cache une valeur avec TTL
   */
  async setWithTTL(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    if (!this.isRedisConnected()) {
      console.warn('[Redis] Not connected, skipping setWithTTL');
      return false;
    }
    
    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      console.error('[Redis] Failed to set with TTL:', error);
      return false;
    }
  }
  
  /**
   * Récupère une valeur du cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client!.get(key);
      if (value === null) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('[Redis] Failed to get value:', error);
      return null;
    }
  }
  
  /**
   * Supprime une clé du cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client!.del(key);
      return result > 0;
    } catch (error) {
      console.error('[Redis] Failed to delete key:', error);
      return false;
    }
  }
  
  /**
   * Vérifie si une clé existe
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error('[Redis] Failed to check key existence:', error);
      return false;
    }
  }
  
  /**
   * Scan les clés avec un pattern (alternative à KEYS)
   */
  async scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    if (!this.isRedisConnected()) {
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
   * Nettoie les clés expirées ou invalides
   */
  async cleanup(): Promise<number> {
    if (!this.isRedisConnected()) {
      return 0;
    }
    
    try {
      // Scanner toutes les clés et vérifier TTL
      const keys = await this.scanKeys('*');
      let cleaned = 0;
      
      for (const key of keys) {
        try {
          const ttl = await this.client!.ttl(key);
          if (ttl === -1) {
            // Clé sans TTL, on peut la supprimer si elle est ancienne
            const age = await this.getKeyAge(key);
            if (age > 86400) { // Plus de 24 heures
              await this.delete(key);
              cleaned++;
            }
          }
        } catch (error) {
          // Ignorer les erreurs individuelles
        }
      }
      
      if (cleaned > 0) {
        console.log(`[Redis] Cleaned up ${cleaned} expired keys`);
      }
      
      return cleaned;
    } catch (error) {
      console.error('[Redis] Cleanup failed:', error);
      return 0;
    }
  }
  
  /**
   * Obtient l'âge d'une clé en secondes
   */
  private async getKeyAge(key: string): Promise<number> {
    try {
      // Cette méthode nécessite une implémentation personnalisée
      // car Redis n'a pas de commande directe pour l'âge
      return 0; // Placeholder
    } catch (error) {
      return 0;
    }
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
  
  /**
   * Obtient des métriques sur Redis
   */
  async getMetrics(): Promise<RedisMetrics> {
    if (!this.isRedisConnected()) {
      return {
        connected: false,
        memory: 0,
        keys: 0,
        hitRate: 0,
        connections: 0
      };
    }
    
    try {
      const info = await this.client!.info('memory');
      const dbsize = await this.client!.dbsize();
      
      // Parser les infos mémoire
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memory = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      return {
        connected: true,
        memory,
        keys: dbsize,
        hitRate: 0, // Nécessite tracking personnalisé
        connections: 1
      };
    } catch (error) {
      console.error('[Redis] Failed to get metrics:', error);
      return {
        connected: false,
        memory: 0,
        keys: 0,
        hitRate: 0,
        connections: 0
      };
    }
  }
}

// ============================================================================
// MÉTRIQUES REDIS
// ============================================================================

export interface RedisMetrics {
  connected: boolean;
  memory: number;
  keys: number;
  hitRate: number;
  connections: number;
}

// ============================================================================
// INSTANCE GLOBALE
// ============================================================================

export const redisManager = new RedisManager(redisConfig);

// ============================================================================
// UTILITAIRES DE CACHE
// ============================================================================

export class CacheUtils {
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
    return await redisManager.setWithTTL(key, results, ttl);
  }
  
  /**
   * Récupère une requête SCOUT du cache
   */
  static async getCachedScoutQuery(query: string, providers: string[]): Promise<any[] | null> {
    const key = this.generateScoutKey(query, providers);
    return await redisManager.get<any[]>(key);
  }
  
  /**
   * Génère une clé de cache pour SCOUT
   */
  private static generateScoutKey(query: string, providers: string[]): string {
    const providersStr = providers.sort().join(',');
    const hash = Buffer.from(`${query}|${providersStr}`).toString('base64').replace(/[+/=]/g, '');
    return `scout:${hash}`;
  }
  
  /**
   * Cache des résultats d'analyse
   */
  static async cacheAnalysis(
    topic: string,
    analysis: any,
    ttl: number = this.DEFAULT_TTL * 2 // 2 heures pour les analyses
  ): Promise<boolean> {
    const key = `analysis:${Buffer.from(topic).toString('base64').replace(/[+/=]/g, '')}`;
    return await redisManager.setWithTTL(key, analysis, ttl);
  }
  
  /**
   * Invalide le cache pour un topic
   */
  static async invalidateTopic(topic: string): Promise<number> {
    const pattern = `*${Buffer.from(topic).toString('base64').replace(/[+/=]/g, '')}*`;
    const keys = await redisManager.scanKeys(pattern);
    
    let deleted = 0;
    for (const key of keys) {
      if (await redisManager.delete(key)) {
        deleted++;
      }
    }
    
    return deleted;
  }
}

// ============================================================================
// AUTO-CLEANUP SCHEDULER
// ============================================================================

// Nettoyage automatique toutes les heures
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    if (redisManager.isRedisConnected()) {
      await redisManager.cleanup();
    }
  }, 3600000); // 1 heure
}
