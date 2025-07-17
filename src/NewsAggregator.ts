import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ConfigLoader } from './utils/ConfigLoader.js';
import { RSSGenerator } from './utils/RSSGenerator.js';
import { FeedRegistryManager } from './utils/FeedRegistry.js';
import { NewsSource } from './sources/NewsSource.js';
import { GoogleNewsSource } from './sources/GoogleNewsSource.js';
import { RedditSource } from './sources/RedditSource.js';
import { HackerNewsSource } from './sources/HackerNewsSource.js';
import { SETNEntertainmentSource } from './sources/SETNEntertainmentSource.js';
import { TVBSEntertainmentSource } from './sources/TVBSEntertainmentSource.js';
import { NextAppleEntertainmentSource } from './sources/NextAppleEntertainmentSource.js';
import { DailyMailTVShowbizSource } from './sources/DailyMailTVShowbizSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from './types/index.js';

export class NewsAggregator {
  private configLoader: ConfigLoader;
  private rssGenerator: RSSGenerator;
  private feedRegistry: FeedRegistryManager;
  private sources: Map<string, NewsSource> = new Map();

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.rssGenerator = new RSSGenerator();
    this.feedRegistry = new FeedRegistryManager();
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
      
      case 'scraper':
        if (config.id === 'setn-entertainment') {
          return new SETNEntertainmentSource(config);
        }
        if (config.id === 'tvbs-entertainment') {
          return new TVBSEntertainmentSource(config);
        }
        if (config.id === 'nextapple-entertainment') {
          return new NextAppleEntertainmentSource(config);
        }
        if (config.id === 'dailymail-tvshowbiz') {
          return new DailyMailTVShowbizSource(config);
        }
        throw new Error(`Unsupported scraper source: ${config.id}`);
      
      default:
        throw new Error(`Unsupported source type: ${config.type}`);
    }
  }

  public async aggregateNews(): Promise<void> {
    const enabledCategories = this.configLoader.getEnabledCategories();
    
    console.log(`🔍 Starting individual source feeds for categories: ${enabledCategories.join(', ')}`);
    
    // Generate individual source feeds for each category
    for (const category of enabledCategories) {
      console.log(`\n📰 Processing category: ${category}`);
      
      const categoryResults = await this.scrapeCategory(category);
      
      // Generate separate feed for each source
      for (const result of categoryResults) {
        if (result.success && result.items.length > 0) {
          await this.generateSourceFeed(result, category);
          console.log(`✅ Generated ${result.source} ${category} feed with ${result.items.length} items`);
        } else if (!result.success) {
          console.log(`⚠️  ${result.source} failed for ${category}: ${result.error}`);
        } else {
          console.log(`⚠️  No items found for ${result.source} ${category}`);
        }
      }
    }

    await this.generateMasterFeed();
    await this.generateIndexPage();
    
    console.log('\n🎉 Individual source feed generation completed successfully!');
  }

  private async scrapeCategory(category: NewsCategory): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];
    const promises: Promise<ScrapingResult>[] = [];
    const activeSourceIds: string[] = [];

    for (const [sourceId, source] of this.sources) {
      if (source.getSupportedCategories().includes(category)) {
        console.log(`  🔄 Scraping ${sourceId} for ${category}...`);
        promises.push(source.scrapeCategory(category));
        activeSourceIds.push(sourceId);
      }
    }

    const scrapingResults = await Promise.allSettled(promises);
    
    scrapingResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        const sourceId = activeSourceIds[index];
        
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

  private async generateSourceFeed(result: ScrapingResult, category: NewsCategory): Promise<void> {
    // Find the source ID from the configuration based on the source name
    let sourceId = '';
    for (const [id, source] of this.sources.entries()) {
      if (source.getName() === result.source) {
        sourceId = id;
        break;
      }
    }
    
    // Fallback to sanitized source name if ID not found
    if (!sourceId) {
      sourceId = result.source.toLowerCase().replace(/\s+/g, '-');
    }
    
    const metadata = this.rssGenerator.createSourceFeedMetadata(result.source, category);
    const feedXML = this.rssGenerator.generateRSSFeed(result.items, metadata);
    
    const outputDir = this.configLoader.getGlobalConfig().outputDirectory;
    const categoryDir = `${outputDir}/${category}`;
    
    // Create category directory if it doesn't exist
    if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true });
    }
    
    const feedPath = `${categoryDir}/${sourceId}.xml`;
    writeFileSync(feedPath, feedXML, 'utf-8');

    // Register the feed in the registry
    const feedName = `${result.source} - ${category.charAt(0).toUpperCase() + category.slice(1)}`;
    
    this.feedRegistry.registerFeed(
      feedName,
      category,
      feedPath,
      result.items.length,
      [result.source]
    );
  }

  private async generateCategoryFeed(category: NewsCategory, items: NewsItem[]): Promise<void> {
    const metadata = this.rssGenerator.createFeedMetadata(category);
    const feedXML = this.rssGenerator.generateRSSFeed(items, metadata);
    
    const outputDir = this.configLoader.getGlobalConfig().outputDirectory;
    const feedPath = `${outputDir}/${category}.xml`;
    
    writeFileSync(feedPath, feedXML, 'utf-8');

    // Register the feed in the registry
    const sources = [...new Set(items.map(item => item.source))];
    const feedName = `${category.charAt(0).toUpperCase() + category.slice(1)} Feed`;
    
    this.feedRegistry.registerFeed(
      feedName,
      category,
      feedPath,
      items.length,
      sources
    );
  }

  private async generateMasterFeed(): Promise<void> {
    console.log('\n🔄 Generating master feed...');
    
    const enabledCategories = this.configLoader.getEnabledCategories();
    // Exclude entertainment from master feed as requested
    const masterCategories = enabledCategories.filter(cat => cat !== 'entertainment');
    const allItems: NewsItem[] = [];

    for (const category of masterCategories) {
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

    // Register the master feed in the registry
    const sources = [...new Set(consolidatedItems.map(item => item.source))];
    
    this.feedRegistry.registerFeed(
      'Master Feed',
      undefined,
      feedPath,
      consolidatedItems.length,
      sources,
      'Combined feed from all categories and sources'
    );
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

    // Generate registry files
    this.feedRegistry.saveMarkdownRegistry();
    console.log('✅ Generated feeds registry and documentation');
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