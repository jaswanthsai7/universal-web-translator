import { CacheStats } from '../types';
import { createCacheKey } from '../utils/hash';
import { logger } from '../utils/logger';

interface StoredCacheItem {
  t: string; // translated text
  ts: number; // timestamp
}

export class TranslationCache {
  private memoryCache: Map<string, string> = new Map();
  private hitCount = 0;
  private missCount = 0;
  private readonly MAX_MEMORY_ITEMS = 15000;
  private readonly MAX_STORAGE_ITEMS = 30000;
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private pendingStorageWrites: Map<string, StoredCacheItem> = new Map();
  private storageWriteTimer: any = null;

  constructor() {
    this.initFromStorage();
  }

  private async initFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const data = await chrome.storage.local.get(['webtrans_cache']);
        if (data.webtrans_cache && typeof data.webtrans_cache === 'object') {
          const now = Date.now();
          for (const [k, v] of Object.entries(data.webtrans_cache)) {
            const item = v as StoredCacheItem;
            if (item && item.t && now - (item.ts || 0) < this.TTL_MS) {
              this.memoryCache.set(k, item.t);
            }
          }
          logger.info(`Loaded ${this.memoryCache.size} translation cache entries from persistent storage`);
        }
      } catch (err) {
        logger.warn('Failed to load cache from chrome.storage.local:', err);
      }
    }
  }

  get(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
    provider: string
  ): string | undefined {
    const key = createCacheKey(sourceText, sourceLang, targetLang, provider);
    const hit = this.memoryCache.get(key);
    if (hit !== undefined) {
      this.hitCount++;
      return hit;
    }
    this.missCount++;
    return undefined;
  }

  /**
   * Batch lookup for multiple texts
   * Returns array of results: string if hit, undefined if cache miss
   */
  getMany(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    provider: string
  ): (string | undefined)[] {
    return texts.map(text => this.get(text, sourceLang, targetLang, provider));
  }

  set(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
    provider: string,
    translatedText: string
  ) {
    const key = createCacheKey(sourceText, sourceLang, targetLang, provider);
    // Evict oldest if exceeding limit
    if (this.memoryCache.size >= this.MAX_MEMORY_ITEMS) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, translatedText);

    // Queue for persistent storage
    this.pendingStorageWrites.set(key, {
      t: translatedText,
      ts: Date.now(),
    });
    this.scheduleStorageFlush();
  }

  setMany(
    texts: string[],
    translations: string[],
    sourceLang: string,
    targetLang: string,
    provider: string
  ) {
    for (let i = 0; i < texts.length; i++) {
      if (translations[i]) {
        this.set(texts[i], sourceLang, targetLang, provider, translations[i]);
      }
    }
  }

  private scheduleStorageFlush() {
    if (this.storageWriteTimer) return;
    this.storageWriteTimer = setTimeout(() => {
      this.flushToStorage();
      this.storageWriteTimer = null;
    }, 2000);
  }

  private async flushToStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    if (this.pendingStorageWrites.size === 0) return;

    try {
      const existing = (await chrome.storage.local.get(['webtrans_cache']))?.webtrans_cache || {};
      for (const [k, v] of this.pendingStorageWrites.entries()) {
        existing[k] = v;
      }
      this.pendingStorageWrites.clear();

      // LRU truncation if exceeds limit
      const keys = Object.keys(existing);
      if (keys.length > this.MAX_STORAGE_ITEMS) {
        keys.sort((a, b) => existing[a].ts - existing[b].ts);
        const toRemove = keys.slice(0, keys.length - this.MAX_STORAGE_ITEMS);
        for (const rk of toRemove) {
          delete existing[rk];
        }
      }

      await chrome.storage.local.set({ webtrans_cache: existing });
      logger.debug(`Flushed translation cache to storage. Total items: ${Object.keys(existing).length}`);
    } catch (err) {
      logger.warn('Failed to flush translation cache to chrome.storage.local:', err);
    }
  }

  async clear() {
    this.memoryCache.clear();
    this.pendingStorageWrites.clear();
    this.hitCount = 0;
    this.missCount = 0;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.remove(['webtrans_cache']);
      } catch (err) {
        logger.warn('Failed to clear storage cache:', err);
      }
    }
    logger.info('Translation cache completely cleared');
  }

  getStats(): CacheStats {
    return {
      inMemoryCount: this.memoryCache.size,
      persistentCount: this.memoryCache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }
}
