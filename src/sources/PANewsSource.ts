import { chromium, Browser, Page } from 'playwright';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class PANewsSource extends NewsSource {
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

  private async scrapePANews(maxArticles: number = 20): Promise<any[]> {
    await this.enforceRateLimit();
    
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    const page = await context.newPage();
    let articles: any[] = [];
    
    try {
      console.log(`      🔄 Loading PANews newsflash page...`);
      
      await page.goto('https://www.panewslab.com/zh/newsflash', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      // Click on "精选" tab to filter to featured news
      try {
        console.log('      🔄 Clicking on 精选 tab...');
        const jingxuanTab = await page.waitForSelector('text=精选', { timeout: 10000 });
        await jingxuanTab.click();
        await page.waitForTimeout(2000);
        console.log('      ✅ Successfully selected 精选 tab');
      } catch (error) {
        console.log('      ⚠️ Could not find 精选 tab, proceeding with default view');
      }
      
      // Wait for JavaScript to load the Nuxt data
      try {
        await page.waitForFunction(() => (window as any).__NUXT__, { timeout: 20000 });
        console.log('      ✅ Nuxt data loaded');
      } catch (error) {
        console.log('      ⚠️ Nuxt data not found, trying alternative approach...');
        // Wait for any content to load and try to extract articles anyway
        await page.waitForTimeout(5000);
      }
      
      // Extract initial articles from JavaScript object
      console.log('      🔄 Extracting articles from JavaScript data...');
      articles = await this.extractArticlesFromJS(page);
      console.log(`      ✅ Extracted ${articles.length} initial articles`);
      
      // Fallback: if no articles found, try HTML scraping
      if (articles.length === 0) {
        console.log('      🔄 Trying HTML fallback scraping...');
        articles = await this.extractArticlesFromHTML(page);
        console.log(`      ✅ HTML fallback extracted ${articles.length} articles`);
      }
      
      // Load more articles if needed by scrolling and clicking load more
      if (articles.length < maxArticles) {
        console.log('      🔄 Loading more articles...');
        
        let loadMoreAttempts = 0;
        const maxLoadAttempts = 5;
        
        while (articles.length < maxArticles && loadMoreAttempts < maxLoadAttempts) {
          loadMoreAttempts++;
          console.log(`      🔄 Load more attempt ${loadMoreAttempts}/${maxLoadAttempts}...`);
          
          // Scroll to bottom to trigger infinite scroll
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await page.waitForTimeout(1500);
          
          // Try to click "加载更多快讯" button
          try {
            const loadMoreButton = await page.waitForSelector('text=加载更多快讯', { timeout: 3000 });
            if (loadMoreButton) {
              await loadMoreButton.click();
              console.log('      ✅ Clicked 加载更多快讯 button');
              await page.waitForTimeout(3000); // Wait for new content to load
            }
          } catch (error) {
            // Try alternative selectors for load more button
            try {
              const loadMoreBtn = await page.waitForSelector('[class*="load"], [class*="more"], button:has-text("更多"), button:has-text("加载")', { timeout: 2000 });
              if (loadMoreBtn) {
                await loadMoreBtn.click();
                console.log('      ✅ Clicked alternative load more button');
                await page.waitForTimeout(3000);
              }
            } catch (e) {
              console.log(`      ⚠️ No load more button found in attempt ${loadMoreAttempts}`);
            }
          }
          
          // Extract articles again to see if we got more
          const newArticles = await this.extractArticlesFromJS(page);
          if (newArticles.length > articles.length) {
            articles = newArticles;
            console.log(`      ✅ Now have ${articles.length} articles total`);
          } else {
            console.log(`      ⚠️ No new articles loaded in attempt ${loadMoreAttempts}`);
          }
        }
      }
      
      // Limit to maxArticles
      const finalArticles = articles.slice(0, maxArticles);
      console.log(`      ✅ Final result: ${finalArticles.length} articles from PANews`);
      
      return finalArticles;
      
    } catch (error) {
      console.error(`      ❌ Error scraping PANews:`, error);
      throw error;
    } finally {
      await context.close();
    }
  }

  private async extractArticlesFromHTML(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const articles: any[] = [];
      
      // Try multiple selectors to find news items
      const selectors = [
        'a[href*="/article"]',
        'a[href*="/zh/"]',
        '.news-item',
        '.flash-item',
        '[class*="item"]',
        'article',
        '.card',
        '[data-v-]' // Vue components often have data-v- attributes
      ];
      
      let foundElements: Element[] = [];
      
      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        if (elements.length > 0) {
          console.log(`HTML fallback: Found ${elements.length} elements with selector: ${selector}`);
          foundElements = elements;
          break;
        }
      }
      
      foundElements.forEach((element, index) => {
        try {
          let title = '';
          let link = '';
          
          // Extract title
          if (element.textContent && element.textContent.trim().length > 10) {
            title = element.textContent.trim();
            // Clean up title - remove extra whitespace and newlines
            title = title.replace(/\s+/g, ' ').trim();
          }
          
          // Extract link
          if (element.tagName === 'A') {
            link = (element as HTMLAnchorElement).href || '';
          } else {
            const linkEl = element.querySelector('a');
            if (linkEl) {
              link = linkEl.href || '';
            }
          }
          
          if (title && title.length >= 10) {
            articles.push({
              title: title,
              link: link || 'https://www.panewslab.com/zh/newsflash',
              timestamp: '',
              description: title,
              index: index,
              source: 'html-fallback'
            });
          }
        } catch (error) {
          console.warn(`Error extracting HTML article ${index}:`, error);
        }
      });
      
      return articles;
    });
  }

  private async extractArticlesFromJS(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const articles: any[] = [];
      
      try {
        // Access the Nuxt data object
        const nuxtData = (window as any).__NUXT__;
        if (!nuxtData) {
          console.log('No Nuxt data found');
          return articles;
        }
        
        console.log('Found Nuxt data, extracting news items...');
        
        // Navigate through the Nuxt data structure to find news items
        // The exact path may vary, so we'll try different approaches
        let newsData: any[] = [];
        
        // Method 1: Look for news/flash data in the main data structure
        if (nuxtData.data && Array.isArray(nuxtData.data)) {
          newsData = nuxtData.data;
        } else if (nuxtData.state && nuxtData.state.data) {
          if (Array.isArray(nuxtData.state.data)) {
            newsData = nuxtData.state.data;
          } else if (nuxtData.state.data.list && Array.isArray(nuxtData.state.data.list)) {
            newsData = nuxtData.state.data.list;
          } else if (nuxtData.state.data.news && Array.isArray(nuxtData.state.data.news)) {
            newsData = nuxtData.state.data.news;
          }
        }
        
        // Method 2: Search recursively through the object for arrays that look like news data
        if (newsData.length === 0) {
          const searchForNewsArrays = (obj: any, depth = 0): any[] => {
            if (depth > 5) return []; // Prevent infinite recursion
            
            if (Array.isArray(obj) && obj.length > 0) {
              // Check if this looks like a news array (objects with title-like properties)
              const firstItem = obj[0];
              if (firstItem && typeof firstItem === 'object' && 
                  (firstItem.title || firstItem.headline || firstItem.content || firstItem.text)) {
                return obj;
              }
            }
            
            if (typeof obj === 'object' && obj !== null) {
              for (const key of Object.keys(obj)) {
                const result = searchForNewsArrays(obj[key], depth + 1);
                if (result.length > 0) {
                  return result;
                }
              }
            }
            
            return [];
          };
          
          newsData = searchForNewsArrays(nuxtData);
        }
        
        console.log(`Found ${newsData.length} potential news items in Nuxt data`);
        
        // Process the found news data
        newsData.forEach((item: any, index: number) => {
          try {
            // Extract title (try various property names)
            let title = item.title || item.headline || item.content || item.text || item.summary || '';
            if (typeof title !== 'string') {
              title = '';
            }
            
            // Clean title
            title = title.trim();
            if (!title || title.length < 10) return;
            
            // Extract URL
            let link = item.url || item.link || item.href || '';
            if (link && !link.startsWith('http')) {
              link = `https://www.panewslab.com${link.startsWith('/') ? '' : '/'}${link}`;
            }
            if (!link) {
              link = 'https://www.panewslab.com/zh/newsflash';
            }
            
            // Extract timestamp
            let timestamp = '';
            const timeValue = item.datetime || item.timestamp || item.time || item.created_at || item.date;
            if (timeValue) {
              if (typeof timeValue === 'number') {
                // Unix timestamp (likely in seconds)
                timestamp = new Date(timeValue * 1000).toISOString();
              } else if (typeof timeValue === 'string') {
                timestamp = timeValue;
              }
            }
            
            // Extract description
            let description = item.description || item.summary || item.excerpt || title;
            if (typeof description !== 'string') {
              description = title;
            }
            
            articles.push({
              title: title,
              link: link,
              timestamp: timestamp,
              description: description.trim(),
              index: index,
              rawData: item // Keep raw data for debugging
            });
            
          } catch (error) {
            console.warn(`Error processing news item ${index}:`, error);
          }
        });
        
        console.log(`Successfully extracted ${articles.length} articles from Nuxt data`);
        
      } catch (error) {
        console.error('Error accessing Nuxt data:', error);
      }
      
      return articles;
    });
  }

  private convertToNewsItems(articles: any[], category: NewsCategory): NewsItem[] {
    const newsItems: NewsItem[] = [];
    
    articles.forEach((article, index) => {
      try {
        let title = article.title;
        
        // Clean title
        if (title.length > 200) {
          title = title.substring(0, 197) + '...';
        }
        
        const link = article.link;
        const description = article.description || title;
        
        // Parse timestamp and convert to UTC
        let publishedAt: Date;
        if (article.timestamp && article.timestamp.trim()) {
          try {
            // If it's already an ISO string from JavaScript extraction
            if (article.timestamp.includes('T') && article.timestamp.includes('Z')) {
              publishedAt = new Date(article.timestamp);
            } else {
              // Handle Chinese time expressions or other formats
              const timeStr = article.timestamp;
              const now = new Date();
              
              if (timeStr.includes('分钟前') || timeStr.includes('分鐘前')) {
                const minutesMatch = timeStr.match(/(\d+)\s*分[钟鐘]前/);
                if (minutesMatch) {
                  publishedAt = new Date(now.getTime() - (parseInt(minutesMatch[1]) * 60 * 1000));
                } else {
                  publishedAt = new Date();
                }
              } else if (timeStr.includes('小时前') || timeStr.includes('小時前')) {
                const hoursMatch = timeStr.match(/(\d+)\s*小[时時]前/);
                if (hoursMatch) {
                  publishedAt = new Date(now.getTime() - (parseInt(hoursMatch[1]) * 60 * 60 * 1000));
                } else {
                  publishedAt = new Date();
                }
              } else if (timeStr.includes('天前')) {
                const daysMatch = timeStr.match(/(\d+)\s*天前/);
                if (daysMatch) {
                  publishedAt = new Date(now.getTime() - (parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000));
                } else {
                  publishedAt = new Date();
                }
              } else if (timeStr.match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/)) {
                // Handle date format
                try {
                  // Assume China timezone (UTC+8) and convert to UTC
                  const localDate = new Date(timeStr);
                  publishedAt = new Date(localDate.getTime() - (8 * 60 * 60 * 1000));
                  if (isNaN(publishedAt.getTime())) {
                    publishedAt = new Date();
                  }
                } catch (e) {
                  publishedAt = new Date();
                }
              } else {
                // Try parsing as regular date string
                publishedAt = new Date(timeStr);
                if (isNaN(publishedAt.getTime())) {
                  publishedAt = new Date();
                }
              }
            }
            
            // Validate the date
            if (isNaN(publishedAt.getTime())) {
              publishedAt = new Date();
            }
            
          } catch (e) {
            publishedAt = new Date();
          }
        } else {
          // For items without timestamp, stagger slightly for RSS ordering
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
          // Add PANews-specific tags
          newsItem.tags.push('panews', 'crypto', 'blockchain', 'chinese-crypto-news');
          
          // Add content-specific tags based on title
          const titleLower = title.toLowerCase();
          if (titleLower.includes('btc') || titleLower.includes('bitcoin') || titleLower.includes('比特币')) {
            newsItem.tags.push('btc', 'bitcoin');
          }
          if (titleLower.includes('eth') || titleLower.includes('ethereum') || titleLower.includes('以太坊')) {
            newsItem.tags.push('eth', 'ethereum');
          }
          if (titleLower.includes('defi') || titleLower.includes('去中心化')) {
            newsItem.tags.push('defi');
          }
          if (titleLower.includes('nft') || titleLower.includes('非同质化')) {
            newsItem.tags.push('nft');
          }
          
          newsItems.push(newsItem);
        }
      } catch (error) {
        console.warn(`Error converting PANews article to NewsItem:`, error);
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

      console.log(`  🔄 Scraping ${this.config.id} for ${category} news from PANews 精选 section...`);
      
      const maxArticles = categoryConfig.maxItems || 20;
      const articles = await this.scrapePANews(maxArticles);
      
      if (articles.length === 0) {
        return this.createErrorResult('No news articles found', category);
      }

      const newsItems = this.convertToNewsItems(articles, category);
      
      // Sort by publication date (newest first)
      const sortedArticles = newsItems
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, maxArticles);

      console.log(`    ✅ ${this.config.id}: ${sortedArticles.length} crypto news articles from PANews`);
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