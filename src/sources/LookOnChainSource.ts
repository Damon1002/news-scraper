import { chromium, Browser, Page } from 'playwright';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class LookOnChainSource extends NewsSource {
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

  private async scrapeBreakingNews(maxArticles: number = 20): Promise<any[]> {
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
      console.log(`      🔄 Loading LookOnChain homepage with infinite scroll handling...`);
      
      // Navigate to homepage
      await page.goto('https://www.lookonchain.com/index.aspx', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait for initial content to load
      await page.waitForTimeout(3000);
      
      // Wait for the main feeds container to appear
      try {
        await page.waitForSelector('#index_feeds_list', { timeout: 15000 });
        console.log('      ✅ Found main feeds container');
      } catch (error) {
        console.log('      ⚠️ Main feeds container not found, trying alternative approach...');
      }
      
      // Get initial fresh content (first 10-15 items that load automatically)
      console.log('      🔄 Extracting initial fresh content...');
      let initialArticles = await page.evaluate(() => {
        const results: any[] = [];
        const feedsContainer = document.querySelector('#index_feeds_list');
        
        if (feedsContainer) {
          const items = feedsContainer.querySelectorAll('.item');
          console.log(`Initial load: Found ${items.length} items in feeds container`);
          
          items.forEach((item, index) => {
            const titleEl = item.querySelector('.title');
            const timeEl = item.querySelector('.time');
            const descEl = item.querySelector('.des');
            const linkEl = item.querySelector('a');
            
            if (titleEl && titleEl.textContent?.trim()) {
              const title = titleEl.textContent.trim();
              const time = timeEl?.textContent?.trim() || '';
              const description = descEl?.textContent?.trim() || title;
              const link = linkEl?.getAttribute('href') || '';
              
              results.push({
                title: title,
                link: link.startsWith('http') ? link : `https://www.lookonchain.com${link}`,
                timestamp: time,
                description: description,
                source: 'initial-load',
                index: index,
                loadOrder: index // Track the original loading order
              });
            }
          });
        }
        
        return results;
      });
      
      articles.push(...initialArticles);
      console.log(`      ✅ Extracted ${initialArticles.length} articles from initial load`);
      
      // If we need more articles, trigger infinite scroll to load additional content
      if (articles.length < maxArticles) {
        console.log('      🔄 Triggering infinite scroll for more content...');
        
        // Simulate scrolling to bottom to trigger loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // Wait for loading indicator to appear
        try {
          await page.waitForSelector('.isloading, .loading, [class*="load"]', { timeout: 5000 });
          console.log('      ✅ Loading indicator appeared');
        } catch (error) {
          console.log('      ⚠️ No loading indicator found, continuing...');
        }
        
        // Wait for loading to complete and new content to appear
        await page.waitForTimeout(3000);
        
        // Try to trigger the site's own infinite scroll mechanism
        await page.evaluate(() => {
          // Trigger the page's scroll loading functions
          if (typeof (window as any).ys === 'object' && (window as any).ys.reload) {
            (window as any).ys.reload();
          }
          if (typeof (window as any).reloaddata === 'function') {
            (window as any).reloaddata();
          }
        });
        
        // Wait for additional content to load
        await page.waitForTimeout(5000);
        
        // Extract additional articles after scroll loading
        const scrollArticles = await page.evaluate((initialCount) => {
          const results: any[] = [];
          const feedsContainer = document.querySelector('#index_feeds_list');
          
          if (feedsContainer) {
            const items = feedsContainer.querySelectorAll('.item');
            console.log(`After scroll: Found ${items.length} total items`);
            
            // Only get items that weren't in the initial load
            for (let i = initialCount; i < items.length; i++) {
              const item = items[i];
              const titleEl = item.querySelector('.title');
              const timeEl = item.querySelector('.time');
              const descEl = item.querySelector('.des');
              const linkEl = item.querySelector('a');
              
              if (titleEl && titleEl.textContent?.trim()) {
                const title = titleEl.textContent.trim();
                const time = timeEl?.textContent?.trim() || '';
                const description = descEl?.textContent?.trim() || title;
                const link = linkEl?.getAttribute('href') || '';
                
                results.push({
                  title: title,
                  link: link.startsWith('http') ? link : `https://www.lookonchain.com${link}`,
                  timestamp: time,
                  description: description,
                  source: 'scroll-load',
                  index: i,
                  loadOrder: i
                });
              }
            }
          }
          
          return results;
        }, initialArticles.length);
        
        articles.push(...scrollArticles);
        console.log(`      ✅ Extracted ${scrollArticles.length} additional articles from infinite scroll`);
      }
      
      // Make fresh AJAX request to ensure we have the absolute latest content
      console.log('      🔄 Making fresh AJAX request for latest updates...');
      const ajaxArticles = await page.evaluate(async () => {
        try {
          const now = new Date();
          const timestamp = now.getFullYear() + '-' + 
                          String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(now.getDate()).padStart(2, '0') + ' ' + 
                          String(now.getHours()).padStart(2, '0') + ':' + 
                          String(now.getMinutes()).padStart(2, '0') + ':' + 
                          String(now.getSeconds()).padStart(2, '0');
          
          const response = await fetch('/ashx/index.ashx', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: `max_time=${encodeURIComponent(timestamp)}&protype=0&count=20`
          });
          
          if (response.ok) {
            const text = await response.text();
            console.log('Fresh AJAX response received, length:', text.length);
            
            const results: any[] = [];
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = text;
            
            const items = tempDiv.querySelectorAll('.item');
            items.forEach((item, index) => {
              const titleEl = item.querySelector('.title');
              const timeEl = item.querySelector('.time');
              const descEl = item.querySelector('.des');
              const linkEl = item.querySelector('a');
              
              if (titleEl && titleEl.textContent?.trim()) {
                const title = titleEl.textContent.trim();
                const time = timeEl?.textContent?.trim() || '';
                const description = descEl?.textContent?.trim() || title;
                const link = linkEl?.getAttribute('href') || '';
                
                if (title.length > 5) {
                  results.push({
                    title: title,
                    link: link.startsWith('http') ? link : `https://www.lookonchain.com${link}`,
                    timestamp: time,
                    description: description,
                    source: 'ajax-fresh',
                    index: index,
                    loadOrder: -index // Negative to prioritize newest
                  });
                }
              }
            });
            
            return results;
          }
        } catch (e) {
          console.log('AJAX call failed:', e);
        }
        return [];
      });
      
      if (ajaxArticles.length > 0) {
        articles.push(...ajaxArticles);
        console.log(`      ✅ Retrieved ${ajaxArticles.length} fresh articles via AJAX`);
      }
      
      // Remove duplicates based on title, keeping the freshest version
      const uniqueArticles = articles.filter((item, index, self) => {
        const firstIndex = self.findIndex(t => t.title === item.title);
        return index === firstIndex;
      });
      
      // Sort by freshness: AJAX fresh content first, then by load order (newest first)
      uniqueArticles.sort((a, b) => {
        // Prioritize AJAX fresh content
        if (a.source === 'ajax-fresh' && b.source !== 'ajax-fresh') return -1;
        if (b.source === 'ajax-fresh' && a.source !== 'ajax-fresh') return 1;
        
        // Then prioritize initial load (newest content) over scroll load (older content)
        if (a.source === 'initial-load' && b.source === 'scroll-load') return -1;
        if (b.source === 'initial-load' && a.source === 'scroll-load') return 1;
        
        // Finally sort by load order (lower index = loaded first = newer)
        return a.loadOrder - b.loadOrder;
      });
      
      // Take only the most recent articles
      const mostRecentArticles = uniqueArticles.slice(0, maxArticles);
      
      console.log(`      ✅ Final result: ${mostRecentArticles.length} most recent articles from LookOnChain`);
      console.log(`      📊 Source breakdown: AJAX(${mostRecentArticles.filter(a => a.source === 'ajax-fresh').length}), Initial(${mostRecentArticles.filter(a => a.source === 'initial-load').length}), Scroll(${mostRecentArticles.filter(a => a.source === 'scroll-load').length})`);
      
      return mostRecentArticles;
      
    } catch (error) {
      console.error(`      ❌ Error scraping LookOnChain:`, error);
      throw error;
    } finally {
      await context.close();
    }
  }

  private convertToNewsItems(articles: any[], category: NewsCategory): NewsItem[] {
    const newsItems: NewsItem[] = [];
    
    articles.forEach((article, index) => {
      try {
        // Ensure English-only content display and clean title
        let title = article.title;
        
        // Clean and enhance title for better readability
        if (title.length < 30 && !title.toLowerCase().includes('spacex') && !title.toLowerCase().includes('btc')) {
          title = `LookOnChain: ${title}`;
        }
        
        // Ensure title is informative for RSS feed
        if (title.length > 200) {
          title = title.substring(0, 197) + '...';
        }
        
        const link = article.link;
        const description = article.description || article.containerText || article.title;
        
        // Parse timestamp and convert to UTC Date
        let publishedAt: Date;
        if (article.timestamp && article.timestamp !== 'recent') {
          // Handle different timestamp formats
          if (article.timestamp.includes('ago')) {
            const now = new Date();
            const minutesMatch = article.timestamp.match(/(\d+)\s*minutes?\s*ago/i);
            const hoursMatch = article.timestamp.match(/(\d+)\s*hours?\s*ago/i);
            const daysMatch = article.timestamp.match(/(\d+)\s*days?\s*ago/i);
            
            if (minutesMatch) {
              publishedAt = new Date(now.getTime() - (parseInt(minutesMatch[1]) * 60 * 1000));
            } else if (hoursMatch) {
              publishedAt = new Date(now.getTime() - (parseInt(hoursMatch[1]) * 60 * 60 * 1000));
            } else if (daysMatch) {
              publishedAt = new Date(now.getTime() - (parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000));
            } else {
              publishedAt = new Date();
            }
          } else if (article.timestamp.match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/)) {
            // Handle date format YYYY.MM.DD or similar
            const cleanDate = article.timestamp.replace(/[.\-]/g, '/');
            publishedAt = new Date(cleanDate);
            // If invalid date, use current time
            if (isNaN(publishedAt.getTime())) {
              publishedAt = new Date();
            }
          } else {
            publishedAt = new Date();
          }
        } else {
          // For recent items, stagger times slightly for better RSS ordering
          const now = new Date();
          publishedAt = new Date(now.getTime() - (index * 2 * 60 * 1000)); // 2 minutes apart
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
          // Add LookOnChain-specific tags
          newsItem.tags.push('lookonchain', 'crypto', 'blockchain', 'on-chain', 'whale-watching');
          
          // Add source-specific tags
          if (article.source) {
            newsItem.tags.push(article.source);
          }
          
          // Add content-specific tags
          const titleLower = title.toLowerCase();
          if (titleLower.includes('spacex')) newsItem.tags.push('spacex');
          if (titleLower.includes('btc') || titleLower.includes('bitcoin')) newsItem.tags.push('btc', 'bitcoin');
          if (titleLower.includes('eth') || titleLower.includes('ethereum')) newsItem.tags.push('eth', 'ethereum');
          if (titleLower.includes('whale')) newsItem.tags.push('whale');
          if (titleLower.includes('million') || titleLower.includes('$')) newsItem.tags.push('high-value');
          if (titleLower.includes('transfer')) newsItem.tags.push('transfer');
          if (titleLower.includes('profit')) newsItem.tags.push('profit');
          
          // Prioritize high-impact news
          if (titleLower.includes('spacex') || titleLower.includes('million') || titleLower.includes('whale')) {
            newsItem.rank = Math.max(1, (newsItem.rank || 10) - 5);
          }
          
          newsItems.push(newsItem);
        }
      } catch (error) {
        console.warn(`Error converting LookOnChain article to NewsItem:`, error);
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

      console.log(`  🔄 Scraping ${this.config.id} for ${category} breaking news using advanced Playwright automation...`);
      
      const maxArticles = categoryConfig.maxItems || 20;
      const articles = await this.scrapeBreakingNews(maxArticles);
      
      if (articles.length === 0) {
        return this.createErrorResult('No news articles found', category);
      }

      const newsItems = this.convertToNewsItems(articles, category);
      
      // Sort by publication date (newest first) and prioritize high-impact news
      const sortedArticles = newsItems
        .sort((a, b) => {
          // First prioritize by rank (lower rank = higher priority)
          if (a.rank !== b.rank) {
            return (a.rank || 10) - (b.rank || 10);
          }
          
          // Then by publish time (newer first)
          return b.publishedAt.getTime() - a.publishedAt.getTime();
        })
        .slice(0, maxArticles);

      console.log(`    ✅ ${this.config.id}: ${sortedArticles.length} crypto news articles from LookOnChain`);
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