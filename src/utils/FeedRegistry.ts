import { writeFileSync, existsSync, readFileSync } from 'fs';
import { NewsCategory } from '../types/index.js';

export interface FeedInfo {
  name: string;
  category?: NewsCategory;
  url: string;
  filePath: string;
  description: string;
  itemCount: number;
  lastUpdated: string;
  sources: string[];
}

export interface FeedRegistry {
  metadata: {
    totalFeeds: number;
    lastUpdated: string;
    baseUrl: string;
    updateFrequency: string;
  };
  feeds: FeedInfo[];
}

export class FeedRegistryManager {
  private registryPath: string;
  private baseUrl: string;

  constructor(registryPath: string = 'docs/feeds-registry.json', baseUrl: string = 'https://damon1002.github.io/google-news-scraper') {
    this.registryPath = registryPath;
    this.baseUrl = baseUrl;
  }

  public loadRegistry(): FeedRegistry {
    if (!existsSync(this.registryPath)) {
      return this.createEmptyRegistry();
    }

    try {
      const data = readFileSync(this.registryPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load registry, creating new one:', error);
      return this.createEmptyRegistry();
    }
  }

  private createEmptyRegistry(): FeedRegistry {
    return {
      metadata: {
        totalFeeds: 0,
        lastUpdated: new Date().toISOString(),
        baseUrl: this.baseUrl,
        updateFrequency: 'Every hour'
      },
      feeds: []
    };
  }

  public registerFeed(
    name: string,
    category: NewsCategory | undefined,
    filePath: string,
    itemCount: number,
    sources: string[],
    description?: string
  ): void {
    const registry = this.loadRegistry();
    
    const url = category ? 
      `${this.baseUrl}/feeds/${category}.xml` : 
      `${this.baseUrl}/feeds/master.xml`;

    const feedInfo: FeedInfo = {
      name,
      category,
      url,
      filePath,
      description: description || this.generateDescription(name, category, sources),
      itemCount,
      lastUpdated: new Date().toISOString(),
      sources
    };

    // Remove existing feed with same name/category if it exists
    registry.feeds = registry.feeds.filter(feed => 
      !(feed.name === name && feed.category === category)
    );

    // Add the new/updated feed
    registry.feeds.push(feedInfo);

    // Update metadata
    registry.metadata.totalFeeds = registry.feeds.length;
    registry.metadata.lastUpdated = new Date().toISOString();

    // Sort feeds: master first, then alphabetically by category
    registry.feeds.sort((a, b) => {
      if (a.name === 'Master Feed') return -1;
      if (b.name === 'Master Feed') return 1;
      if (!a.category) return -1;
      if (!b.category) return 1;
      return a.category.localeCompare(b.category);
    });

    this.saveRegistry(registry);
  }

  private generateDescription(name: string, category: NewsCategory | undefined, sources: string[]): string {
    const sourceList = sources.join(', ');
    
    if (category) {
      return `${category.charAt(0).toUpperCase() + category.slice(1)} news aggregated from ${sourceList}`;
    } else {
      return `Combined news feed from all categories, aggregated from ${sourceList}`;
    }
  }

  private saveRegistry(registry: FeedRegistry): void {
    writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
    console.log(`📝 Updated feed registry with ${registry.feeds.length} feeds`);
  }

  public generateMarkdownRegistry(): string {
    const registry = this.loadRegistry();
    
    let markdown = `# RSS Feeds Registry\n\n`;
    markdown += `> **Last Updated:** ${new Date(registry.metadata.lastUpdated).toLocaleString()}\n`;
    markdown += `> **Total Feeds:** ${registry.metadata.totalFeeds}\n`;
    markdown += `> **Update Frequency:** ${registry.metadata.updateFrequency}\n\n`;

    markdown += `## 📡 Available RSS Feeds\n\n`;

    for (const feed of registry.feeds) {
      markdown += `### ${feed.name}\n`;
      markdown += `- **URL:** \`${feed.url}\`\n`;
      markdown += `- **Description:** ${feed.description}\n`;
      markdown += `- **Items:** ${feed.itemCount}\n`;
      markdown += `- **Sources:** ${feed.sources.join(', ')}\n`;
      markdown += `- **Last Updated:** ${new Date(feed.lastUpdated).toLocaleString()}\n\n`;
    }

    markdown += `## 🔗 Quick Copy URLs\n\n`;
    markdown += `\`\`\`\n`;
    for (const feed of registry.feeds) {
      markdown += `${feed.url}\n`;
    }
    markdown += `\`\`\`\n\n`;

    markdown += `## 📱 Usage Examples\n\n`;
    markdown += `### RSS Readers\n`;
    markdown += `Copy any URL above into your RSS reader (Feedly, Inoreader, etc.)\n\n`;
    
    markdown += `### JavaScript/API Usage\n`;
    markdown += `\`\`\`javascript\n`;
    markdown += `// Fetch master feed\n`;
    markdown += `const response = await fetch('${registry.feeds.find(f => f.name === 'Master Feed')?.url}');\n`;
    markdown += `const rssText = await response.text();\n\n`;
    
    markdown += `// Parse with any RSS parser library\n`;
    markdown += `// Example with rss-parser:\n`;
    markdown += `const Parser = require('rss-parser');\n`;
    markdown += `const parser = new Parser();\n`;
    markdown += `const feed = await parser.parseString(rssText);\n`;
    markdown += `\`\`\`\n\n`;

    markdown += `---\n`;
    markdown += `*Generated automatically by [Multi-Source News Scraper](${this.baseUrl})*\n`;

    return markdown;
  }

  public saveMarkdownRegistry(): void {
    const markdown = this.generateMarkdownRegistry();
    writeFileSync('docs/FEEDS.md', markdown);
    console.log('📝 Generated FEEDS.md documentation');
  }

  public getFeedUrls(): string[] {
    const registry = this.loadRegistry();
    return registry.feeds.map(feed => feed.url);
  }

  public getFeedByCategory(category: NewsCategory): FeedInfo | undefined {
    const registry = this.loadRegistry();
    return registry.feeds.find(feed => feed.category === category);
  }

  public getMasterFeed(): FeedInfo | undefined {
    const registry = this.loadRegistry();
    return registry.feeds.find(feed => feed.name === 'Master Feed');
  }
}