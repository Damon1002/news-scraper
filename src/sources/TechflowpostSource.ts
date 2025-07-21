import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class TechflowpostSource extends NewsSource {
  private async fetchPage(url: string): Promise<string> {
    await this.enforceRateLimit();
    
    try {
      const response: AxiosResponse<string> = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          ...this.config.headers
        },
        timeout: 15000,
        maxRedirects: 5
      });
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  private parseBeijingTime(timeText: string): Date {
    // Parse format like "07月21日 22:37" (Beijing time)
    const timeMatch = timeText.match(/(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})/);
    if (!timeMatch) {
      return new Date();
    }

    const [, month, day, hour, minute] = timeMatch;
    const currentYear = new Date().getFullYear();
    
    // Create date in Beijing timezone (UTC+8)
    const beijingTime = `${currentYear}-${month}-${day}T${hour}:${minute}:00+08:00`;
    const date = new Date(beijingTime);
    
    return date; // JavaScript automatically converts to UTC
  }

  private async fetchWithPlaywright(url: string, category: NewsCategory): Promise<string> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    
    try {
      console.log(`  🔄 Scraping ${this.config.id} for ${url.includes('technology') ? 'technology' : 'business'} using Playwright browser automation...`);
      
      await this.enforceRateLimit();
      
      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      page = await browser.newPage();
      
      // Set user agent and headers
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      
      console.log(`      🔄 Loading Techflowpost newsletter page...`);
      
      // Navigate to the page
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for content to load
      await page.waitForSelector('.content', { timeout: 15000 });
      
      // Click "Show More" button multiple times to load more content
      const targetItems = this.getCategoryConfig(category)?.maxItems || 25;
      let clickCount = 0;
      const maxClicks = Math.ceil((targetItems - 10) / 10); // Initial 10 items + 10 per click
      
      console.log(`      🔄 Clicking "Show More" button to load ${targetItems} items...`);
      
      for (let i = 0; i < maxClicks; i++) {
        try {
          // Wait for the "Show More" button and check if it's available
          const showMoreButton = await page.$('a.linmore.dbd');
          
          if (!showMoreButton) break;
          
          // Check if button is disabled or shows "已经到底了哦~"
          const buttonText = await showMoreButton.textContent();
          if (buttonText && buttonText.includes('已经到底了')) {
            console.log(`      ✅ Reached end of content at ${buttonText}`);
            break;
          }
          
          // Check if button is visible
          const isVisible = await showMoreButton.isVisible();
          if (!isVisible) break;
          
          // Click the button
          await showMoreButton.click();
          clickCount++;
          
          // Wait for new content to load
          await page.waitForTimeout(2000);
          
          // Wait for network to be idle after loading
          await page.waitForLoadState('networkidle', { timeout: 10000 });
          
          console.log(`      ✅ Clicked "Show More" button ${clickCount} times`);
          
        } catch (error) {
          console.log(`      ⚠️ Could not click "Show More" button (attempt ${i + 1}): ${error}`);
          break;
        }
      }
      
      // Get the final HTML content
      const html = await page.content();
      console.log(`      ✅ Loaded content with ${clickCount} additional pages`);
      
      return html;
      
    } catch (error) {
      console.error(`      ❌ Playwright error: ${error}`);
      throw error;
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  }

  private async parseArticles(html: string, category: NewsCategory): Promise<NewsItem[]> {
    const $ = cheerio.load(html);
    const articles: NewsItem[] = [];
    
    // Parse articles from the newsletter structure
    $('.content dl').each((index, element) => {
      const $article = $(element);
      
      // Extract timestamp from <dt> element
      const timeElement = $article.find('dt.font-i.dfont').text().trim();
      if (!timeElement) return;
      
      // Extract title from the link
      const $titleLink = $article.find('a.dfont.f18.line20.fw');
      if (!$titleLink.length) return;
      
      const title = $titleLink.text().trim();
      if (!title) return;
      
      // Get the article URL - use the newsletter URL as source since these are newsletter items
      const articleUrl = this.config.baseUrl;
      
      // Extract description from the abstract section
      let description = $article.find('div.f12.line18 i.opa60').text().trim();
      
      // Remove the "[原文链接]" text if present
      description = description.replace(/\[原文链接\]/g, '').trim();
      
      // If no description, create one from title
      if (!description) {
        description = `${title.substring(0, 100)}...`;
      }
      
      // Parse Beijing time to UTC
      const publishedDate = this.parseBeijingTime(timeElement);
      
      const newsItem = this.createNewsItem(
        title,
        articleUrl,
        category,
        publishedDate,
        description,
        undefined, // No image extraction for now
        index + 1
      );
      
      articles.push(newsItem);
    });
    
    // Sort by published date (newest first)
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    
    const maxItems = this.getCategoryConfig(category)?.maxItems || 25;
    console.log(`      ✅ Extracted ${articles.length} articles, limiting to ${maxItems}`);
    
    return articles.slice(0, maxItems);
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

      const url = `${this.config.baseUrl}${categoryConfig.endpoint}`;
      console.log(`  🔄 Scraping ${this.config.id} for ${category}...`);
      
      // Use Playwright to handle dynamic content loading
      const html = await this.fetchWithPlaywright(url, category);
      const articles = await this.parseArticles(html, category);
      
      if (articles.length === 0) {
        return this.createErrorResult('No articles found', category);
      }

      console.log(`    ✅ ${this.config.id}: ${articles.length} items with Beijing time converted to UTC`);
      return this.createSuccessResult(articles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    }
  }
}