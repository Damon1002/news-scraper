import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { NewsItem, CachedNewsItem, SourceCache, CacheData, NewsCategory } from '../types/index.js';

export class CacheManager {
  private cacheFilePath: string;
  private cache: CacheData;
  private static instance: CacheManager;

  private constructor(cacheFilePath: string = 'cache/news-cache.json') {
    this.cacheFilePath = cacheFilePath;
    this.cache = this.loadCache();
  }

  public static getInstance(cacheFilePath?: string): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(cacheFilePath);
    }
    return CacheManager.instance;
  }

  private loadCache(): CacheData {
    if (existsSync(this.cacheFilePath)) {
      try {
        const cacheContent = readFileSync(this.cacheFilePath, 'utf-8');
        const cache = JSON.parse(cacheContent) as CacheData;
        console.log(`📦 Loaded cache with ${Object.keys(cache.sources).length} source caches`);
        return cache;
      } catch (error) {
        console.warn(`⚠️  Failed to load cache, starting fresh: ${error}`);
      }
    }
    
    return {
      version: '1.0.0',
      lastUpdate: new Date().toISOString(),
      sources: {}
    };
  }

  public saveCache(): void {
    try {
      this.cache.lastUpdate = new Date().toISOString();
      
      // Ensure cache directory exists
      const cacheDir = this.cacheFilePath.split('/').slice(0, -1).join('/');
      if (cacheDir && !existsSync(cacheDir)) {
        require('fs').mkdirSync(cacheDir, { recursive: true });
      }
      
      writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8');
      console.log(`💾 Saved cache with ${Object.keys(this.cache.sources).length} source caches`);
    } catch (error) {
      console.error(`❌ Failed to save cache: ${error}`);
    }
  }

  private generateContentHash(item: NewsItem): string {
    const content = `${item.title}|${item.description || ''}|${item.sourceUrl}|${item.publishedAt.toISOString()}`;
    return createHash('md5').update(content).digest('hex');
  }

  private generateItemsHash(items: CachedNewsItem[]): string {
    const sortedHashes = items.map(item => item.contentHash).sort();
    return createHash('md5').update(sortedHashes.join('|')).digest('hex');
  }

  private convertToCache(items: NewsItem[]): CachedNewsItem[] {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      source: item.source,
      sourceUrl: item.sourceUrl,
      category: item.category,
      tags: item.tags,
      publishedAt: item.publishedAt.toISOString(),
      scrapedAt: item.scrapedAt.toISOString(),
      rank: item.rank,
      imageUrl: item.imageUrl,
      contentHash: this.generateContentHash(item)
    }));
  }

  private convertFromCache(cachedItems: CachedNewsItem[]): NewsItem[] {
    return cachedItems.map(cached => ({
      id: cached.id,
      title: cached.title,
      description: cached.description,
      source: cached.source,
      sourceUrl: cached.sourceUrl,
      category: cached.category,
      tags: cached.tags,
      publishedAt: new Date(cached.publishedAt),
      scrapedAt: new Date(cached.scrapedAt),
      rank: cached.rank,
      imageUrl: cached.imageUrl
    }));
  }

  public getCacheKey(sourceId: string, category: NewsCategory): string {
    return `${sourceId}_${category}`;
  }

  public hasChanges(sourceId: string, category: NewsCategory, newItems: NewsItem[]): boolean {
    const cacheKey = this.getCacheKey(sourceId, category);
    const sourceCache = this.cache.sources[cacheKey];
    
    if (!sourceCache || sourceCache.items.length === 0) {
      return true; // No cache = has changes
    }

    const newCachedItems = this.convertToCache(newItems);
    const newItemsHash = this.generateItemsHash(newCachedItems);
    
    const hasChanges = sourceCache.itemsHash !== newItemsHash;
    
    if (hasChanges) {
      console.log(`🔄 Changes detected for ${sourceId}/${category}: hash ${sourceCache.itemsHash} -> ${newItemsHash}`);
    } else {
      console.log(`✅ No changes for ${sourceId}/${category}: hash ${sourceCache.itemsHash}`);
    }
    
    return hasChanges;
  }

  public updateCache(sourceId: string, category: NewsCategory, items: NewsItem[]): void {
    const cacheKey = this.getCacheKey(sourceId, category);
    const cachedItems = this.convertToCache(items);
    
    this.cache.sources[cacheKey] = {
      sourceId,
      category,
      lastUpdate: new Date().toISOString(),
      items: cachedItems,
      itemsHash: this.generateItemsHash(cachedItems)
    };
    
    console.log(`📝 Updated cache for ${sourceId}/${category} with ${items.length} items`);
  }

  public getCachedItems(sourceId: string, category: NewsCategory): NewsItem[] {
    const cacheKey = this.getCacheKey(sourceId, category);
    const sourceCache = this.cache.sources[cacheKey];
    
    if (!sourceCache) {
      return [];
    }
    
    return this.convertFromCache(sourceCache.items);
  }

  public getCacheStats(): { 
    totalSources: number; 
    totalItems: number; 
    lastUpdate: string;
    sources: Array<{ sourceId: string; category: string; itemCount: number; lastUpdate: string }>;
  } {
    const sources = Object.values(this.cache.sources).map(cache => ({
      sourceId: cache.sourceId,
      category: cache.category,
      itemCount: cache.items.length,
      lastUpdate: cache.lastUpdate
    }));

    return {
      totalSources: Object.keys(this.cache.sources).length,
      totalItems: sources.reduce((sum, source) => sum + source.itemCount, 0),
      lastUpdate: this.cache.lastUpdate,
      sources
    };
  }

  public clearCache(): void {
    this.cache = {
      version: '1.0.0',
      lastUpdate: new Date().toISOString(),
      sources: {}
    };
    console.log('🗑️  Cache cleared');
  }

  public getOldestCacheAge(): number {
    const dates = Object.values(this.cache.sources).map(cache => 
      new Date(cache.lastUpdate).getTime()
    );
    
    if (dates.length === 0) {
      return 0;
    }
    
    const oldestTime = Math.min(...dates);
    return Date.now() - oldestTime;
  }
}