import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ConfigLoader } from './utils/ConfigLoader.js';
import { RSSGenerator } from './utils/RSSGenerator.js';
import { NewsSource } from './sources/NewsSource.js';
import { GoogleNewsSource } from './sources/GoogleNewsSource.js';
import { RedditSource } from './sources/RedditSource.js';
import { HackerNewsSource } from './sources/HackerNewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from './types/index.js';

export class NewsAggregator {
  private configLoader: ConfigLoader;
  private rssGenerator: RSSGenerator;
  private sources: Map<string, NewsSource> = new Map();

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.rssGenerator = new RSSGenerator();
  }

  public async initialize(): Promise<void> {
    const config = this.configLoader.loadConfig();
    
    for (const sourceConfig of config.sources) {
      if (!sourceConfig.enabled) continue;
      
      const source = this.createSource(sourceConfig);
      this.sources.set(sourceConfig.id, source);
    }

    const outputDir = this.configLoader.getGlobalConfig().outputDirectory;
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log(`✅ Initialized ${this.sources.size} news sources`);
  }

  private createSource(config: SourceConfig): NewsSource {
    switch (config.type) {
      case 'rss':
        if (config.id === 'google-news') {
          return new GoogleNewsSource(config);
        }
        throw new Error(`Unsupported RSS source: ${config.id}`);
      
      case 'api':
        if (config.id === 'reddit') {
          return new RedditSource(config);
        }
        if (config.id === 'hackernews') {
          return new HackerNewsSource(config);
        }
        throw new Error(`Unsupported API source: ${config.id}`);
      
      default:
        throw new Error(`Unsupported source type: ${config.type}`);
    }
  }

  public async aggregateNews(): Promise<void> {
    const enabledCategories = this.configLoader.getEnabledCategories();
    const globalConfig = this.configLoader.getGlobalConfig();
    
    console.log(`🔍 Starting news aggregation for categories: ${enabledCategories.join(', ')}`);
    
    for (const category of enabledCategories) {
      console.log(`\n📰 Processing category: ${category}`);
      
      const categoryResults = await this.scrapeCategory(category);
      const allItems = this.consolidateResults(categoryResults);
      
      if (allItems.length > 0) {
        await this.generateCategoryFeed(category, allItems);
        console.log(`✅ Generated ${category} feed with ${allItems.length} items`);
      } else {
        console.log(`⚠️  No items found for ${category}`);
      }
    }

    await this.generateMasterFeed();
    await this.generateIndexPage();
    
    console.log('\n🎉 News aggregation completed successfully!');
  }

  private async scrapeCategory(category: NewsCategory): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];
    const promises: Promise<ScrapingResult>[] = [];

    for (const [sourceId, source] of this.sources) {
      if (source.getSupportedCategories().includes(category)) {
        console.log(`  🔄 Scraping ${sourceId} for ${category}...`);
        promises.push(source.scrapeCategory(category));
      }
    }

    const scrapingResults = await Promise.allSettled(promises);
    
    scrapingResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        const sourceId = Array.from(this.sources.keys())[index];
        
        if (result.value.success) {
          console.log(`    ✅ ${sourceId}: ${result.value.items.length} items`);
        } else {
          console.log(`    ❌ ${sourceId}: ${result.value.error}`);
        }
      } else {
        console.log(`    ❌ Source failed: ${result.reason}`);
      }
    });

    return results;
  }

  private consolidateResults(results: ScrapingResult[]): NewsItem[] {
    const allItems: NewsItem[] = [];
    const seenTitles = new Set<string>();

    for (const result of results) {
      if (!result.success) continue;

      for (const item of result.items) {
        const titleKey = this.normalizeTitle(item.title);
        
        if (!seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          allItems.push(item);
        }
      }
    }

    return allItems
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, this.configLoader.getGlobalConfig().maxItemsPerFeed);
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  private async generateCategoryFeed(category: NewsCategory, items: NewsItem[]): Promise<void> {
    const metadata = this.rssGenerator.createFeedMetadata(category);
    const feedXML = this.rssGenerator.generateRSSFeed(items, metadata);
    
    const outputDir = this.configLoader.getGlobalConfig().outputDirectory;
    const feedPath = `${outputDir}/${category}.xml`;
    
    writeFileSync(feedPath, feedXML, 'utf-8');
  }

  private async generateMasterFeed(): Promise<void> {
    console.log('\n🔄 Generating master feed...');
    
    const enabledCategories = this.configLoader.getEnabledCategories();
    const allItems: NewsItem[] = [];

    for (const category of enabledCategories) {
      const categoryResults = await this.scrapeCategory(category);
      const categoryItems = this.consolidateResults(categoryResults);
      allItems.push(...categoryItems);
    }

    const consolidatedItems = this.consolidateResults([{
      items: allItems,
      success: true,
      timestamp: new Date(),
      source: 'master',
      category: NewsCategory.GENERAL
    }]);

    const metadata = this.rssGenerator.createFeedMetadata();
    const feedXML = this.rssGenerator.generateRSSFeed(consolidatedItems, metadata);
    
    const outputDir = this.configLoader.getGlobalConfig().outputDirectory;
    const feedPath = `${outputDir}/master.xml`;
    
    writeFileSync(feedPath, feedXML, 'utf-8');
    console.log(`✅ Generated master feed with ${consolidatedItems.length} items`);
  }

  private async generateIndexPage(): Promise<void> {
    const enabledCategories = this.configLoader.getEnabledCategories();
    const indexHTML = this.rssGenerator.generateFeedIndex(enabledCategories);
    
    const docsDir = 'docs';
    if (!existsSync(docsDir)) {
      mkdirSync(docsDir, { recursive: true });
    }
    
    writeFileSync(`${docsDir}/index.html`, indexHTML, 'utf-8');
    console.log('✅ Generated feed index page');
  }

  public async cleanup(): Promise<void> {
    for (const source of this.sources.values()) {
      if (source instanceof GoogleNewsSource) {
        await source.cleanup();
      }
    }
  }

  public displayStats(): void {
    console.log('\n📊 Aggregation Statistics:');
    console.log(`  Sources: ${this.sources.size}`);
    console.log(`  Categories: ${this.configLoader.getEnabledCategories().length}`);
    console.log(`  Output Directory: ${this.configLoader.getGlobalConfig().outputDirectory}`);
  }
}