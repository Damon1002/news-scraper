import { NewsItem, FeedMetadata, NewsCategory, SourceConfig } from '../types/index.js';

export class RSSGenerator {
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private formatRSSDate(date: Date): string {
    // Convert to UTC and format as RFC 822 date with +0000 timezone
    return date.toUTCString().replace('GMT', '+0000');
  }

  private createRSSItem(item: NewsItem): string {
    const pubDate = this.formatRSSDate(item.publishedAt);
    const escapedTitle = this.escapeXML(item.title);
    const escapedDescription = this.escapeXML(item.description || `News from ${item.source}`);
    const escapedSource = this.escapeXML(item.source);
    
    const categories = item.tags.map(tag => 
      `      <category>${this.escapeXML(tag)}</category>`
    ).join('\n');

    const enclosure = item.imageUrl ? 
      `      <enclosure url="${item.imageUrl}" type="image/jpeg"/>` : '';

    return `    <item>
      <title>${escapedTitle}</title>
      <link>${item.sourceUrl}</link>
      <description>${escapedDescription}</description>
      <pubDate>${pubDate}</pubDate>
      <source>${escapedSource}</source>
      <guid isPermaLink="true">${item.sourceUrl}</guid>
${categories}
${enclosure}
    </item>`;
  }

  public generateRSSFeed(items: NewsItem[], metadata: FeedMetadata): string {
    const rssDate = this.formatRSSDate(metadata.lastBuildDate);
    const categoryTag = metadata.category ? 
      `    <category>${metadata.category}</category>` : '';

    const rssItems = items
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map(item => this.createRSSItem(item))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${this.escapeXML(metadata.title)}</title>
    <link>${metadata.link}</link>
    <description>${this.escapeXML(metadata.description)}</description>
    <language>${metadata.language}</language>
    <lastBuildDate>${rssDate}</lastBuildDate>
    <pubDate>${rssDate}</pubDate>
    <ttl>${metadata.ttl}</ttl>
${categoryTag}
    <atom:link href="${metadata.link}" rel="self" type="application/rss+xml"/>
    <generator>Multi-Source News Aggregator</generator>
    <managingEditor>noreply@github.com</managingEditor>
    <webMaster>noreply@github.com</webMaster>
${rssItems}
  </channel>
</rss>`;
  }

  public createSourceFeedMetadata(
    sourceName: string,
    category: NewsCategory,
    baseUrl: string = 'https://damon1002.github.io/news-scraper'
  ): FeedMetadata {
    let categoryName: string;
    let language = 'en-US';

    if (category === 'entertainment') {
      categoryName = '娱乐星闻';
      language = 'zh-TW';
    } else {
      categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    }

    const sourceId = sourceName.toLowerCase().replace(/\s+/g, '-');
    
    return {
      title: category === 'entertainment' ? `${categoryName} - ${sourceName}` : `${categoryName} News - ${sourceName}`,
      description: category === 'entertainment' ? 
        `来自${sourceName}的最新娱乐星闻` : 
        `Latest ${categoryName.toLowerCase()} news from ${sourceName}`,
      link: `${baseUrl}/feeds/${category}/${sourceId}.xml`,
      language,
      category,
      lastBuildDate: new Date(),
      ttl: 60
    };
  }

  public createFeedMetadata(
    category?: NewsCategory,
    baseUrl: string = 'https://damon1002.github.io/news-scraper'
  ): FeedMetadata {
    let categoryName: string;
    let categoryDescription: string;
    let language = 'en-US';

    if (category === 'entertainment') {
      categoryName = '娱乐星闻';
      categoryDescription = '来自三立新闻网的最新娱乐星闻';
      language = 'zh-TW';
    } else if (category) {
      categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      categoryDescription = `${categoryName} news`;
    } else {
      categoryName = 'All';
      categoryDescription = 'Latest news from multiple sources';
    }

    return {
      title: category === 'entertainment' ? categoryName : `News Feed - ${categoryName}`,
      description: category === 'entertainment' ? categoryDescription : `Automated ${categoryDescription} aggregated from various sources`,
      link: category ? 
        `${baseUrl}/feeds/${category}.xml` : 
        `${baseUrl}/feeds/master.xml`,
      language,
      category,
      lastBuildDate: new Date(),
      ttl: 60
    };
  }

  private getCategoryEmoji(category: NewsCategory, sourceName: string): string {
    // Return appropriate emoji based on category and source
    switch (category) {
      case 'entertainment':
        if (sourceName.includes('SETN')) return '🎬';
        if (sourceName.includes('TVBS')) return '📺';
        if (sourceName.includes('壹苹') || sourceName.includes('NextApple')) return '🍎';
        if (sourceName.includes('HK01')) return '🇭🇰';
        if (sourceName.includes('Page Six')) return '📰';
        return '🎭';
      case 'crypto':
        return '💰';
      case 'technology':
        return '💻';
      case 'business':
        return '💼';
      case 'science':
        return '🔬';
      case 'world':
        return '🌍';
      case 'general':
        return '📰';
      case 'health':
        return '🏥';
      case 'sports':
        return '⚽';
      case 'politics':
        return '🏛️';
      case 'breaking':
        return '🚨';
      default:
        return '📰';
    }
  }

  public generateFeedIndex(categories: NewsCategory[], sources: SourceConfig[]): string {
    // Dynamically generate feed links from enabled sources
    const feedLinks: string[] = [];
    
    // Add enabled sources with their feeds
    sources
      .filter(source => source.enabled)
      .forEach(source => {
        source.categories.forEach(categoryConfig => {
          const category = categoryConfig.category;
          const emoji = this.getCategoryEmoji(category, source.name);
          const feedPath = `feeds/${category}/${source.id}.xml`;
          const linkText = `${emoji} ${source.name}`;
          
          feedLinks.push(`    <li><a href="${feedPath}">${linkText}</a></li>`);
        });
      });
    
    // Add external feeds (Daily Mail - external RSS)
    feedLinks.push('    <li><a href="https://www.dailymail.co.uk/tvshowbiz/articles.rss" target="_blank">📰 Daily Mail TVShowbiz</a></li>');
    
    const feedLinksHTML = feedLinks.join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>News Feeds - Multi-Source Aggregator</title>
    <link rel="alternate" type="application/rss+xml" title="All News" href="feeds/master.xml">
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .feed-list { list-style-type: none; padding: 0; }
        .feed-list li { margin: 10px 0; }
        .feed-list a { text-decoration: none; color: #0066cc; padding: 10px; display: block; border: 1px solid #ddd; border-radius: 5px; }
        .feed-list a:hover { background-color: #f5f5f5; }
        .status { margin-top: 30px; padding: 10px; background-color: #f0f8ff; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>📰 Multi-Source News Feeds</h1>
    <p>Automated news aggregation from multiple sources, updated every 2 minutes.</p>
    
    <h2>Available Feeds</h2>
    <ul class="feed-list">
        <li><a href="feeds/master.xml">🌟 Master Feed (All Categories)</a></li>
${feedLinksHTML}
    </ul>
    
    <div class="status">
        <h3>Feed Information</h3>
        <ul>
            <li><strong>Update Frequency:</strong> Every 2 minutes</li>
            <li><strong>Format:</strong> RSS 2.0</li>
            <li><strong>Items per Feed:</strong> Up to 50 latest articles</li>
            <li><strong>Last Updated:</strong> ${new Date().toLocaleString()}</li>
        </ul>
    </div>
    
    <footer style="margin-top: 30px; text-align: center; color: #666;">
        <p>Powered by <a href="https://github.com/Damon1002/news-scraper">Multi-Source News Scraper</a></p>
    </footer>
</body>
</html>`;
  }
}