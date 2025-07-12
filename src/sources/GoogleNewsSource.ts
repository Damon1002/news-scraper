import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from '../types/index.js';

export class GoogleNewsSource extends NewsSource {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: SourceConfig) {
    super(config);
  }

  async scrapeCategory(category: NewsCategory): Promise<ScrapingResult> {
    await this.enforceRateLimit();

    try {
      const categoryConfig = this.config.categories.find(cat => cat.category === category);
      if (!categoryConfig) {
        return this.createErrorResult(`Category ${category} not supported`, category);
      }

      const newsItems = await this.scrapeRSSFeed(categoryConfig.endpoint, category, categoryConfig.maxItems);
      
      if (newsItems.length === 0) {
        const playwrightItems = await this.scrapeWithPlaywright(categoryConfig.endpoint, category, categoryConfig.maxItems);
        return this.createSuccessResult(playwrightItems, category);
      }

      return this.createSuccessResult(newsItems, category);
    } catch (error) {
      console.error(`Error scraping Google News ${category}:`, error);
      return this.createErrorResult(error instanceof Error ? error.message : 'Unknown error', category);
    }
  }

  private async scrapeRSSFeed(endpoint: string, category: NewsCategory, maxItems: number): Promise<NewsItem[]> {
    const rssUrl = `${this.config.baseUrl}${endpoint}`;
    const newsItems: NewsItem[] = [];

    try {
      const response = await axios.get(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...this.config.headers
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data, { xmlMode: true });

      $('item').each((index, element) => {
        if (index >= maxItems) return false;

        const $item = $(element);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = $item.find('pubDate').text().trim();
        const description = $item.find('description').text().trim();

        const titleParts = title.split(' - ');
        const cleanTitle = titleParts.slice(0, -1).join(' - ');
        const source = titleParts[titleParts.length - 1] || 'Unknown';

        const publishedAt = pubDate ? new Date(pubDate) : new Date();

        const newsItem = this.createNewsItem(
          cleanTitle || title,
          link,
          category,
          publishedAt,
          description,
          undefined,
          index + 1
        );

        newsItems.push(newsItem);
      });

    } catch (error) {
      console.error('Error scraping RSS feed:', error);
      throw error;
    }

    return newsItems;
  }

  private async scrapeWithPlaywright(endpoint: string, category: NewsCategory, maxItems: number): Promise<NewsItem[]> {
    if (!this.page) {
      await this.initializeBrowser();
    }

    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const newsItems: NewsItem[] = [];
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await this.page.waitForSelector('article', { timeout: 10000 });

      const articles = await this.page.$$eval('article', (elements) => {
        return elements.slice(0, 20).map((article, index) => {
          const titleElement = article.querySelector('h3, h4, a[class*="JtKRv"]');
          const title = titleElement?.textContent?.trim() || '';

          const sourceElement = article.querySelector('div[class*="vr1PYe"], time + span, a[class*="wEwyrc"]');
          const source = sourceElement?.textContent?.trim() || '';

          const linkElement = article.querySelector('a[href^="/articles/"], a[href^="./articles/"]');
          const relativeLink = linkElement?.getAttribute('href') || '';
          const link = relativeLink ? `https://news.google.com${relativeLink.replace('./', '/')}` : '';

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

      articles.forEach((article, index) => {
        if (index >= maxItems || !article.title || !article.link) return;

        const publishedAt = this.parseTimeToDate(article.time);
        
        const newsItem = this.createNewsItem(
          article.title,
          article.link,
          category,
          publishedAt,
          `News from ${article.source}`,
          undefined,
          article.rank
        );

        newsItems.push(newsItem);
      });

    } catch (error) {
      console.error('Error with Playwright scraping:', error);
      throw error;
    }

    return newsItems;
  }

  private async initializeBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
  }

  private parseTimeToDate(timeStr: string): Date {
    const now = new Date();
    
    if (!timeStr || timeStr.includes('Just now')) {
      return now;
    }
    
    if (timeStr.includes('minute') || timeStr.includes('min')) {
      const minutes = parseInt(timeStr.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - minutes * 60000);
    }
    
    if (timeStr.includes('hour')) {
      const hours = parseInt(timeStr.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 3600000);
    }
    
    if (timeStr.includes('day')) {
      const days = parseInt(timeStr.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - days * 86400000);
    }
    
    return now;
  }

  public async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}