import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import { logger } from '../config/logger.js';

type RedisClient = ReturnType<typeof createClient>;

const DEFAULT_PREFIX = 'coding-history:';
const CONNECT_RETRY_DELAY_MS = 10_000;

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)])
    );
  }
  return value;
}

export class CacheService {
  private client?: RedisClient;
  private connectPromise?: Promise<RedisClient | null>;
  private unavailableUntil = 0;

  private get enabled(): boolean {
    return process.env.REDIS_ENABLED?.toLowerCase() === 'true';
  }

  private get prefix(): string {
    return process.env.REDIS_KEY_PREFIX?.trim() || DEFAULT_PREFIX;
  }

  private async getClient(): Promise<RedisClient | null> {
    if (!this.enabled || Date.now() < this.unavailableUntil) return null;
    if (this.client?.isOpen) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      const client = this.client ?? createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
      client.on('error', (error) => {
        logger.warn({ msg: '[Redis] connection error', error: error instanceof Error ? error.message : String(error) });
      });
      try {
        await client.connect();
        this.client = client;
        this.unavailableUntil = 0;
        logger.info('[Redis] cache connection ready');
        return client;
      } catch (error) {
        this.unavailableUntil = Date.now() + CONNECT_RETRY_DELAY_MS;
        this.client = undefined;
        logger.warn({ msg: '[Redis] unavailable, falling back to SQLite', error: error instanceof Error ? error.message : String(error) });
        return null;
      } finally {
        this.connectPromise = undefined;
      }
    })();

    return this.connectPromise;
  }

  private versionKey(namespace: string): string {
    return `${this.prefix}version:${namespace}`;
  }

  private async getVersion(namespace: string): Promise<string | null> {
    const client = await this.getClient();
    if (!client) return null;
    try {
      return (await client.get(this.versionKey(namespace))) || '0';
    } catch (error) {
      logger.warn({ msg: '[Redis] get version failed', namespace, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  createQueryKey(namespace: string, query: unknown, version: string): string {
    const payload = JSON.stringify(normalize(query));
    const digest = createHash('sha256').update(payload).digest('hex');
    return `${this.prefix}${namespace}:v${version}:${digest}`;
  }

  async getOrSet<T>(namespace: string, query: unknown, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const version = await this.getVersion(namespace);
    if (!version) return loader();
    const key = this.createQueryKey(namespace, query, version);
    const client = await this.getClient();

    if (client) {
      try {
        const cached = await client.get(key);
        if (cached !== null) return JSON.parse(cached) as T;
      } catch (error) {
        logger.warn({ msg: '[Redis] read cache failed', namespace, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const result = await loader();
    if (client) {
      try {
        await client.set(key, JSON.stringify(result), { EX: ttlSeconds });
      } catch (error) {
        logger.warn({ msg: '[Redis] write cache failed', namespace, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  async invalidate(namespace: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    try {
      await client.incr(this.versionKey(namespace));
    } catch (error) {
      logger.warn({ msg: '[Redis] invalidate failed', namespace, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const cacheService = new CacheService();
