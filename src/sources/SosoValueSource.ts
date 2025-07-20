import { chromium, Browser, Page } from 'playwright';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class SosoValueSource extends NewsSource {
  private browser: Browser | null = null;

  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });
    }
    return this.browser;
  }

  private async scrapeResearchArticles(maxArticles: number = 20): Promise<any[]> {
    await this.enforceRateLimit();
    
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    const page = await context.newPage();
    const articles: any[] = [];
    
    try {
      console.log(`      🔄 Loading SosoValue research page...`);
      
      // Navigate to research page
      await page.goto('https://sosovalue.com/research', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for content to load
      await page.waitForTimeout(8000);
      
      // Extract research articles
      const extractedArticles = await page.evaluate(() => {
        const results: any[] = [];
        
        // Look for research article links with specific IDs
        const researchLinks = document.querySelectorAll('a[href*="/research/"]');
        
        researchLinks.forEach((link) => {
          const href = (link as HTMLAnchorElement).href;
          
          // Only get individual research articles (with numeric IDs), not category pages
          if (href && href.includes('/research/') && /\/research\/\d+$/.test(href)) {
            const container = link.closest('div, article, section');
            const title = link.textContent?.trim() || '';
            const containerText = container?.textContent?.trim() || '';
            
            // Extract timestamp from container
            const timeRegex = /(\d+)\s*(minutes?|hours?|days?)\s*ago/i;
            const timeMatch = containerText.match(timeRegex);
            
            // Extract source/author from container text  
            const sourceRegex = /(TechFlow|ForesightNews|PANews|CoinDesk|CoinTelegraph|Decrypt|The Block|Cointelegraph|吴说)/i;
            const sourceMatch = containerText.match(sourceRegex);
            
            if (title && title.length > 2) {
              results.push({
                title: title,
                link: href,
                timestamp: timeMatch ? timeMatch[0] : null,
                source: sourceMatch ? sourceMatch[1] : 'SosoValue',
                containerText: containerText.substring(0, 300),
                rawTime: timeMatch ? { value: parseInt(timeMatch[1]), unit: timeMatch[2] } : null,
                titleLength: title.length
              });
            }
          }
        });
        
        // Group by link and choose the longest/most descriptive title for each URL
        const groupedByLink = new Map<string, any[]>();
        results.forEach(item => {
          if (!groupedByLink.has(item.link)) {
            groupedByLink.set(item.link, []);
          }
          groupedByLink.get(item.link)!.push(item);
        });
        
        const uniqueResults: any[] = [];
        groupedByLink.forEach((items, link) => {
          // Choose the item with the longest title (most descriptive content)
          const bestItem = items.reduce((best, current) => {
            // Prefer longer titles, but avoid just source names (less than 20 chars usually)
            if (current.titleLength > best.titleLength && current.titleLength > 20) {
              return current;
            }
            // If current title is much longer than best, choose it
            if (current.titleLength > best.titleLength * 2) {
              return current;
            }
            return best;
          });
          
          uniqueResults.push(bestItem);
        });
        
        return uniqueResults;
      });
      
      articles.push(...extractedArticles);
      console.log(`      ✅ Extracted ${extractedArticles.length} research articles from SosoValue`);
      
      return articles.slice(0, maxArticles);
      
    } catch (error) {
      console.error(`      ❌ Error scraping SosoValue:`, error);
      throw error;
    } finally {
      await context.close();
    }
  }

  private convertToNewsItems(articles: any[], category: NewsCategory): NewsItem[] {
    const newsItems: NewsItem[] = [];
    
    articles.forEach((article, index) => {
      try {
        // Use the full article title (already includes source info if needed)
        const title = article.title.length > 50 ? article.title : `${article.source}: ${article.title}`;
        const link = article.link;
        const description = article.containerText || article.title;
        
        // Parse relative timestamp and convert to UTC Date
        let publishedAt: Date;
        if (article.rawTime) {
          const now = new Date();
          const { value, unit } = article.rawTime;
          
          if (unit.toLowerCase().startsWith('minute')) {
            publishedAt = new Date(now.getTime() - (value * 60 * 1000));
          } else if (unit.toLowerCase().startsWith('hour')) {
            publishedAt = new Date(now.getTime() - (value * 60 * 60 * 1000));
          } else if (unit.toLowerCase().startsWith('day')) {
            publishedAt = new Date(now.getTime() - (value * 24 * 60 * 60 * 1000));
          } else {
            publishedAt = new Date();
          }
        } else {
          publishedAt = new Date();
        }
        
        const newsItem = this.createNewsItem(
          title,
          link,
          category,
          publishedAt,
          description,
          undefined,
          index + 1
        );
        
        if (newsItem) {
          // Add SosoValue-specific tags
          newsItem.tags.push('sosovalue', 'crypto', 'blockchain', 'research', article.source.toLowerCase());
          newsItems.push(newsItem);
        }
      } catch (error) {
        console.warn(`Error converting SosoValue article to NewsItem:`, error);
      }
    });
    
    return newsItems;
  }

  private getCategoryConfig(category: NewsCategory) {
    return this.config.categories.find(cat => cat.category === category);
  }

  async scrapeCategory(category: NewsCategory): Promise<ScrapingResult> {
    try {
      const categoryConfig = this.getCategoryConfig(category);
      if (!categoryConfig) {
        return this.createErrorResult(`Category ${category} not configured`, category);
      }

      console.log(`  🔄 Scraping ${this.config.id} for ${category} using Playwright browser automation...`);
      
      const maxArticles = categoryConfig.maxItems || 20;
      const articles = await this.scrapeResearchArticles(maxArticles);
      
      if (articles.length === 0) {
        return this.createErrorResult('No articles found', category);
      }

      const newsItems = this.convertToNewsItems(articles, category);
      
      // Sort by publication date (newest first)
      const sortedArticles = newsItems
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, maxArticles);

      console.log(`    ✅ ${this.config.id}: ${sortedArticles.length} articles from SosoValue Research`);
      return this.createSuccessResult(sortedArticles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    } finally {
      // Clean up browser resources
      if (this.browser) {
        try {
          await this.browser.close();
          this.browser = null;
        } catch (error) {
          console.warn('Error closing browser:', error);
        }
      }
    }
  }
}