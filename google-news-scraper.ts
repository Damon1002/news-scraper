import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';

interface NewsItem {
  rank: number;
  title: string;
  source: string;
  link: string;
  time?: string;
}

class GoogleNewsScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  /**
   * Initialize the browser for dynamic content scraping
   */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set user agent to avoid detection
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
  }

  /**
   * Scrape Google News using Playwright for dynamic content
   */
  async scrapeWithPlaywright(url: string): Promise<NewsItem[]> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const newsItems: NewsItem[] = [];

    try {
      // Navigate to the URL
      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for articles to load
      await this.page.waitForSelector('article', { timeout: 10000 });

      // Extract news items
      const articles = await this.page.$$eval('article', (elements) => {
        return elements.slice(0, 20).map((article, index) => {
          // Extract title
          const titleElement = article.querySelector('h3, h4, a[class*="JtKRv"]');
          const title = titleElement?.textContent?.trim() || '';

          // Extract source
          const sourceElement = article.querySelector('div[class*="vr1PYe"], time + span, a[class*="wEwyrc"]');
          const source = sourceElement?.textContent?.trim() || '';

          // Extract link
          const linkElement = article.querySelector('a[href^="/articles/"], a[href^="./articles/"]');
          const relativeLink = linkElement?.getAttribute('href') || '';
          const link = relativeLink ? `https://news.google.com${relativeLink.replace('./', '/')}` : '';

          // Extract time
          const timeElement = article.querySelector('time');
          const time = timeElement?.textContent?.trim() || '';

          return {
            rank: index + 1,
            title,
            source,
            link,
            time
          };
        });
      });

      newsItems.push(...articles);

    } catch (error) {
      console.error('Error scraping with Playwright:', error);
      throw error;
    }

    return newsItems;
  }

  /**
   * Alternative method using RSS feed (more reliable)
   */
  async scrapeRSSFeed(): Promise<NewsItem[]> {
    const rssUrl = 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVWRDR2dKQlZTZ0FQAQ?hl=en-US&gl=US&ceid=US:en';
    const newsItems: NewsItem[] = [];

    try {
      const response = await axios.get(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data, { xmlMode: true });

      $('item').each((index, element) => {
        if (index >= 20) return false; // Limit to 20 items

        const $item = $(element);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = $item.find('pubDate').text().trim();
        
        // Extract source from title (usually in format "Title - Source")
        const titleParts = title.split(' - ');
        const cleanTitle = titleParts.slice(0, -1).join(' - ');
        const source = titleParts[titleParts.length - 1] || 'Unknown';

        newsItems.push({
          rank: index + 1,
          title: cleanTitle || title,
          source: source,
          link: link,
          time: this.formatDate(pubDate)
        });
      });

    } catch (error) {
      console.error('Error scraping RSS feed:', error);
      throw error;
    }

    return newsItems;
  }

  /**
   * Format date from RSS pubDate
   */
  private formatDate(pubDate: string): string {
    try {
      const date = new Date(pubDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return pubDate;
    }
  }

  /**
   * Clean up browser resources
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Display news items in console
   */
  displayNews(newsItems: NewsItem[]): void {
    console.log('\n📰 Google News - US Headlines (Top 20)\n');
    console.log('━'.repeat(80));
    
    newsItems.forEach((item) => {
      console.log(`\n${item.rank}. ${item.title}`);
      console.log(`   Source: ${item.source}`);
      if (item.time) {
        console.log(`   Time: ${item.time}`);
      }
      if (item.link) {
        console.log(`   Link: ${item.link}`);
      }
      console.log('─'.repeat(80));
    });
  }

  /**
   * Export news items to JSON
   */
  exportToJSON(newsItems: NewsItem[], filename: string = 'google_news.json'): void {
    const data = {
      timestamp: new Date().toISOString(),
      source: 'Google News - US Headlines',
      count: newsItems.length,
      articles: newsItems
    };

    writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\n✅ Exported ${newsItems.length} news items to ${filename}`);
  }
}

// Main execution
async function main() {
  const scraper = new GoogleNewsScraper();
  
  try {
    console.log('🔍 Starting Google News scraper...\n');

    // Method 1: Try RSS feed first (more reliable)
    console.log('📡 Attempting to fetch news via RSS feed...');
    let newsItems = await scraper.scrapeRSSFeed();

    // Method 2: If RSS fails or returns no results, try Playwright
    if (newsItems.length === 0) {
      console.log('🌐 RSS feed empty, trying dynamic scraping...');
      await scraper.initialize();
      const url = 'https://news.google.com/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVWRDR2dKQlZTZ0FQAQ?hl=en-US&gl=US&ceid=US:en';
      newsItems = await scraper.scrapeWithPlaywright(url);
    }

    if (newsItems.length > 0) {
      // Display results
      scraper.displayNews(newsItems);
      
      // Export to JSON
      scraper.exportToJSON(newsItems);
    } else {
      console.log('❌ No news items found. Google News might have changed its structure.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await scraper.close();
  }
}

// Run the scraper
main().catch(console.error);

// Export for use as a module
export { GoogleNewsScraper, NewsItem };