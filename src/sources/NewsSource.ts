import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from '../types/index.js';

export abstract class NewsSource {
  protected config: SourceConfig;
  protected lastRequestTime: number = 0;

  constructor(config: SourceConfig) {
    this.config = config;
  }

  abstract scrapeCategory(category: NewsCategory): Promise<ScrapingResult>;

  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = (60 * 1000) / this.config.rateLimit;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  protected generateId(title: string, source: string): string {
    const content = `${title}-${source}`;
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  protected createNewsItem(
    title: string,
    url: string,
    category: NewsCategory,
    publishedAt?: Date,
    description?: string,
    imageUrl?: string,
    rank?: number
  ): NewsItem {
    return {
      id: this.generateId(title, this.config.name),
      title: title.trim(),
      description: description?.trim(),
      source: this.config.name,
      sourceUrl: url,
      category,
      tags: [category, this.config.name.toLowerCase()],
      publishedAt: publishedAt || new Date(),
      scrapedAt: new Date(),
      rank,
      imageUrl
    };
  }

  protected createSuccessResult(
    items: NewsItem[],
    category: NewsCategory
  ): ScrapingResult {
    return {
      items,
      success: true,
      timestamp: new Date(),
      source: this.config.name,
      category
    };
  }

  protected createErrorResult(
    error: string,
    category: NewsCategory
  ): ScrapingResult {
    return {
      items: [],
      success: false,
      error,
      timestamp: new Date(),
      source: this.config.name,
      category
    };
  }

  public getId(): string {
    return this.config.id;
  }

  public getName(): string {
    return this.config.name;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getSupportedCategories(): NewsCategory[] {
    return this.config.categories.map(cat => cat.category);
  }
}