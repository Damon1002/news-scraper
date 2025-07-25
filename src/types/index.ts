export enum NewsCategory {
  GENERAL = 'general',
  TECHNOLOGY = 'technology',
  BUSINESS = 'business',
  SPORTS = 'sports',
  SCIENCE = 'science',
  HEALTH = 'health',
  ENTERTAINMENT = 'entertainment',
  WORLD = 'world',
  POLITICS = 'politics',
  BREAKING = 'breaking',
  CRYPTO = 'crypto'
}

export interface NewsItem {
  id: string;
  title: string;
  description?: string;
  source: string;
  sourceUrl: string;
  category: NewsCategory;
  tags: string[];
  publishedAt: Date;
  scrapedAt: Date;
  rank?: number;
  imageUrl?: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'scraper';
  baseUrl: string;
  categories: CategoryConfig[];
  rateLimit: number;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface CategoryConfig {
  category: NewsCategory;
  endpoint: string;
  maxItems: number;
  updateFrequency: number;
}

export interface ScrapingResult {
  items: NewsItem[];
  success: boolean;
  error?: string;
  timestamp: Date;
  source: string;
  category: NewsCategory;
}

export interface FeedMetadata {
  title: string;
  description: string;
  link: string;
  language: string;
  category?: NewsCategory;
  lastBuildDate: Date;
  ttl: number;
}

export interface CachedNewsItem {
  id: string;
  title: string;
  description?: string;
  source: string;
  sourceUrl: string;
  category: NewsCategory;
  tags: string[];
  publishedAt: string; // ISO string for JSON serialization
  scrapedAt: string;   // ISO string for JSON serialization
  rank?: number;
  imageUrl?: string;
  contentHash: string; // Hash of content for change detection
}

export interface SourceCache {
  sourceId: string;
  category: NewsCategory;
  lastUpdate: string; // ISO string
  items: CachedNewsItem[];
  itemsHash: string; // Hash of all items for quick comparison
}

export interface CacheData {
  version: string;
  lastUpdate: string; // ISO string
  sources: Record<string, SourceCache>; // key: `${sourceId}_${category}`
}