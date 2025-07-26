import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ConfigLoader } from './utils/ConfigLoader.js';
import { RSSGenerator } from './utils/RSSGenerator.js';
import { FeedRegistryManager } from './utils/FeedRegistry.js';
import { CacheManager } from './utils/CacheManager.js';
import { NewsSource } from './sources/NewsSource.js';
import { SETNEntertainmentSource } from './sources/SETNEntertainmentSource.js';
import { TVBSEntertainmentSource } from './sources/TVBSEntertainmentSource.js';
import { NextAppleEntertainmentSource } from './sources/NextAppleEntertainmentSource.js';
import { PageSixEntertainmentSource } from './sources/PageSixEntertainmentSource.js';
import { HK01EntertainmentSource } from './sources/HK01EntertainmentSource.js';
import { TechflowpostSource } from './sources/TechflowpostSource.js';
import { LookOnChainSource } from './sources/LookOnChainSource.js';
import { PANewsSource } from './sources/PANewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from './types/index.js';

export class NewsAggregator {
  private configLoader: ConfigLoader;
  private rssGenerator: RSSGenerator;
  private feedRegistry: FeedRegistryManager;
  private cacheManager: CacheManager;
  private sources: Map<string, NewsSource> = new Map();

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.rssGenerator = new RSSGenerator();
    this.feedRegistry = new FeedRegistryManager();
    this.cacheManager = CacheManager.getInstance();
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

    // Ensure cache directory exists
    const cacheDir = 'cache';
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    console.log(`✅ Initialized ${this.sources.size} news sources`);
    
    // Display cache statistics
    const cacheStats = this.cacheManager.getCacheStats();
    console.log(`📦 Cache loaded: ${cacheStats.totalSources} sources, ${cacheStats.totalItems} items`);
    if (cacheStats.totalSources > 0) {
      const cacheAge = this.cacheManager.getOldestCacheAge();
      const ageHours = Math.round(cacheAge / (1000 * 60 * 60) * 10) / 10;
      console.log(`📅 Oldest cache: ${ageHours} hours ago`);
    }
  }

  private createSource(config: SourceConfig): NewsSource {
    switch (config.type) {
      case 'rss':
        throw new Error(`Unsupported RSS source: ${config.id}`);
      
      case 'api':
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
        if (config.id === 'pagesix-entertainment') {
          return new PageSixEntertainmentSource(config);
        }
        if (config.id === 'hk01-entertainment') {
          return new HK01EntertainmentSource(config);
        }
        if (config.id === 'techflowpost') {
          return new TechflowpostSource(config);
        }
        if (config.id === 'lookonchain') {
          return new LookOnChainSource(config);
        }
        if (config.id === 'panews') {
          return new PANewsSource(config);
        }
        throw new Error(`Unsupported scraper source: ${config.id}`);
      
      default:
        throw new Error(`Unsupported source type: ${config.type}`);
    }
  }

  public async checkForChanges(): Promise<boolean> {
    const enabledCategories = this.configLoader.getEnabledCategories();
    let hasAnyChanges = false;
    
    console.log(`🔍 Quick cache check for categories: ${enabledCategories.join(', ')}`);
    
    for (const category of enabledCategories) {
      for (const [sourceId, source] of this.sources) {
        if (source.getSupportedCategories().includes(category)) {
          const cacheKey = this.cacheManager.getCacheKey(sourceId, category);
          const cacheStats = this.cacheManager.getCacheStats();
          
          // Check if we have any cached data for this source
          const hasCache = cacheStats.sources.some(s => 
            s.sourceId === sourceId && s.category === category
          );
          
          if (!hasCache) {
            console.log(`📦 No cache found for ${sourceId}/${category} - changes assumed`);
            hasAnyChanges = true;
          } else {
            // Check cache age - if older than update frequency, assume changes
            const sourceCache = cacheStats.sources.find(s => 
              s.sourceId === sourceId && s.category === category
            );
            if (sourceCache) {
              const ageMinutes = (Date.now() - new Date(sourceCache.lastUpdate).getTime()) / (1000 * 60);
              const sourceConfig = this.configLoader.loadConfig().sources.find(s => s.id === sourceId);
              const updateFrequency = sourceConfig?.categories.find(c => c.category === category)?.updateFrequency || 60;
              
              if (ageMinutes > updateFrequency) {
                console.log(`⏰ Cache for ${sourceId}/${category} is ${Math.round(ageMinutes)}min old (>${updateFrequency}min) - changes likely`);
                hasAnyChanges = true;
              } else {
                console.log(`✅ Cache for ${sourceId}/${category} is fresh (${Math.round(ageMinutes)}min old)`);
              }
            }
          }
        }
      }
    }
    
    console.log(`🎯 Quick check result: ${hasAnyChanges ? 'Changes likely' : 'No changes expected'}`);
    return hasAnyChanges;
  }

  public async aggregateNews(filterCategories?: string[]): Promise<void> {
    let enabledCategories = this.configLoader.getEnabledCategories();
    
    // Filter categories if specified
    if (filterCategories && filterCategories.length > 0) {
      enabledCategories = enabledCategories.filter(category => 
        filterCategories.includes(category)
      );
      if (enabledCategories.length === 0) {
        console.log('⚠️  No enabled categories match the filter. Available categories:', this.configLoader.getEnabledCategories().join(', '));
        return;
      }
    }
    
    console.log(`🔍 Starting parallel source feeds for categories: ${enabledCategories.join(', ')}`);
    
    // Process all categories in parallel for better performance
    const categoryPromises = enabledCategories.map(async (category) => {
      console.log(`\n📰 Processing category: ${category}`);
      
      const categoryResults = await this.scrapeCategory(category);
      
      // Generate feeds for this category in parallel
      const feedPromises = categoryResults.map(async (result) => {
        if (result.success && result.items.length > 0) {
          await this.generateSourceFeed(result, category);
          console.log(`✅ Generated ${result.source} ${category} feed with ${result.items.length} items`);
          return { source: result.source, category, success: true, count: result.items.length };
        } else if (!result.success) {
          console.log(`⚠️  ${result.source} failed for ${category}: ${result.error}`);
          return { source: result.source, category, success: false, error: result.error };
        } else {
          console.log(`⚠️  No items found for ${result.source} ${category}`);
          return { source: result.source, category, success: true, count: 0 };
        }
      });
      
      return Promise.all(feedPromises);
    });
    
    // Wait for all categories to complete
    const allResults = await Promise.all(categoryPromises);
    const flatResults = allResults.flat();
    
    // Log summary
    const successCount = flatResults.filter(r => r.success).length;
    const totalItems = flatResults.reduce((sum, r) => sum + (r.count || 0), 0);
    console.log(`\n📊 Parallel processing complete: ${successCount}/${flatResults.length} feeds, ${totalItems} total items`);

    await this.generateIndexPage();
    
    console.log('\n🎉 Parallel source feed generation completed successfully!');
  }

  private async scrapeCategory(category: NewsCategory): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];
    const promises: Promise<ScrapingResult>[] = [];
    const activeSourceIds: string[] = [];
    const cacheHits: ScrapingResult[] = [];

    // First check cache and only scrape sources with changes
    for (const [sourceId, source] of this.sources) {
      if (source.getSupportedCategories().includes(category)) {
        // Try to get fresh data first to compare with cache
        console.log(`  🔄 Checking ${sourceId} for ${category} changes...`);
        promises.push(source.scrapeCategory(category));
        activeSourceIds.push(sourceId);
      }
    }

    const scrapingResults = await Promise.allSettled(promises);
    
    scrapingResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const sourceId = activeSourceIds[index];
        
        if (result.value.success) {
          // Check if items have changed compared to cache
          const hasChanges = this.cacheManager.hasChanges(sourceId, category, result.value.items);
          
          if (hasChanges) {
            // Update cache with new items
            this.cacheManager.updateCache(sourceId, category, result.value.items);
            results.push(result.value);
            console.log(`    ✅ ${sourceId}: ${result.value.items.length} items (updated)`);
          } else {
            // Use cached items
            const cachedItems = this.cacheManager.getCachedItems(sourceId, category);
            const cachedResult: ScrapingResult = {
              items: cachedItems,
              success: true,
              timestamp: new Date(),
              source: result.value.source,
              category: category
            };
            cacheHits.push(cachedResult);
            console.log(`    📦 ${sourceId}: ${cachedItems.length} items (cached)`);
          }
        } else {
          // If scraping failed, try to use cached items as fallback
          const cachedItems = this.cacheManager.getCachedItems(sourceId, category);
          if (cachedItems.length > 0) {
            const cachedResult: ScrapingResult = {
              items: cachedItems,
              success: true,
              timestamp: new Date(),
              source: result.value.source,
              category: category
            };
            cacheHits.push(cachedResult);
            console.log(`    📦 ${sourceId}: ${cachedItems.length} items (cached fallback) - scraping failed: ${result.value.error}`);
          } else {
            results.push(result.value);
            console.log(`    ❌ ${sourceId}: ${result.value.error}`);
          }
        }
      } else {
        const sourceId = activeSourceIds[index];
        // Try to use cached items as fallback
        const cachedItems = this.cacheManager.getCachedItems(sourceId, category);
        if (cachedItems.length > 0) {
          const cachedResult: ScrapingResult = {
            items: cachedItems,
            success: true,
            timestamp: new Date(),
            source: sourceId,
            category: category
          };
          cacheHits.push(cachedResult);
          console.log(`    📦 ${sourceId}: ${cachedItems.length} items (cached fallback) - source failed: ${result.reason}`);
        } else {
          console.log(`    ❌ Source failed: ${result.reason}`);
        }
      }
    });

    // Save cache after processing all sources
    this.cacheManager.saveCache();

    // Combine fresh results with cache hits
    return [...results, ...cacheHits];
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


  private async generateIndexPage(): Promise<void> {
    const enabledCategories = this.configLoader.getEnabledCategories();
    const sources = this.configLoader.getEnabledSources();
    const indexHTML = this.rssGenerator.generateFeedIndex(enabledCategories, sources);
    
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
    // No cleanup needed for current sources
  }

  public displayStats(): void {
    console.log('\n📊 Aggregation Statistics:');
    console.log(`  Sources: ${this.sources.size}`);
    console.log(`  Categories: ${this.configLoader.getEnabledCategories().length}`);
    console.log(`  Output Directory: ${this.configLoader.getGlobalConfig().outputDirectory}`);
    
    // Display cache statistics
    const cacheStats = this.cacheManager.getCacheStats();
    console.log(`\n📦 Cache Statistics:`);
    console.log(`  Cached Sources: ${cacheStats.totalSources}`);
    console.log(`  Cached Items: ${cacheStats.totalItems}`);
    console.log(`  Cache Hit Ratio: ${this.calculateCacheHitRatio()}%`);
    
    if (cacheStats.totalSources > 0) {
      console.log(`\n📋 Source Cache Details:`);
      cacheStats.sources.forEach(source => {
        const lastUpdate = new Date(source.lastUpdate);
        const ageMinutes = Math.round((Date.now() - lastUpdate.getTime()) / (1000 * 60));
        console.log(`  ${source.sourceId}/${source.category}: ${source.itemCount} items (${ageMinutes}m ago)`);
      });
    }
  }

  private calculateCacheHitRatio(): number {
    // This would need to be tracked during scraping for accurate calculation
    // For now, return a simple estimation based on cache availability
    const cacheStats = this.cacheManager.getCacheStats();
    if (cacheStats.totalSources === 0) return 0;
    return Math.round((cacheStats.totalSources / (this.sources.size * this.configLoader.getEnabledCategories().length)) * 100);
  }
}