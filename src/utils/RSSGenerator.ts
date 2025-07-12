import { NewsItem, FeedMetadata, NewsCategory } from '../types/index.js';

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
    return date.toUTCString();
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

  public generateFeedIndex(categories: NewsCategory[]): string {
    const feedLinks = categories.map(category => {
      let categoryName: string;
      if (category === 'entertainment') {
        categoryName = '🎬 娱乐星闻 (SETN)';
      } else {
        categoryName = category.charAt(0).toUpperCase() + category.slice(1) + ' News';
      }
      return `    <li><a href="feeds/${category}.xml">${categoryName}</a></li>`;
    }).join('\n');

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
    <p>Automated news aggregation from multiple sources, updated hourly.</p>
    
    <h2>Available Feeds</h2>
    <ul class="feed-list">
        <li><a href="feeds/master.xml">🌟 Master Feed (All Categories)</a></li>
${feedLinks}
    </ul>
    
    <div class="status">
        <h3>Feed Information</h3>
        <ul>
            <li><strong>Update Frequency:</strong> Every hour</li>
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