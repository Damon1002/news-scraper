import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class SETNEntertainmentSource extends NewsSource {
  private async fetchPage(url: string): Promise<string> {
    await this.enforceRateLimit();
    
    try {
      const response: AxiosResponse<string> = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
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

  private parseArticles(html: string, category: NewsCategory): NewsItem[] {
    const $ = cheerio.load(html);
    const articles: NewsItem[] = [];
    
    // Look for article links with /news/ pattern
    $('a[href*="/news/"]').each((index, element) => {
      try {
        const $article = $(element);
        const href = $article.attr('href');
        
        if (!href || !href.includes('/news/')) return;
        
        // Build full URL
        const fullUrl = href.startsWith('http') ? href : `https://star.setn.com${href}`;
        
        // Extract title from various possible locations
        let title = $article.find('h3').text().trim() ||
                   $article.find('.title').text().trim() ||
                   $article.find('div[class*="title"]').text().trim() ||
                   $article.text().trim();
        
        // Clean up title
        title = title.replace(/\s+/g, ' ').trim();
        
        if (!title || title.length < 10) return;
        
        // Extract image URL
        let imageUrl: string | undefined;
        const $img = $article.find('img').first();
        if ($img.length) {
          const imgSrc = $img.attr('src') || $img.attr('data-src');
          if (imgSrc) {
            imageUrl = imgSrc.startsWith('http') ? imgSrc : `https://star.setn.com${imgSrc}`;
          }
        }
        
        // Extract description if available
        let description = $article.find('.summary, .description, .excerpt').text().trim();
        if (!description) {
          // Try to get text from parent container
          description = $article.parent().find('p').first().text().trim();
        }
        
        // Create news item
        const newsItem = this.createNewsItem(
          title,
          fullUrl,
          category,
          new Date(),
          description || `${title.substring(0, 100)}...`,
          imageUrl,
          index + 1
        );
        
        articles.push(newsItem);
      } catch (error) {
        console.warn('Error parsing article:', error);
      }
    });
    
    // Remove duplicates based on URL
    const uniqueArticles = articles.filter((article, index, self) =>
      index === self.findIndex(a => a.sourceUrl === article.sourceUrl)
    );
    
    return uniqueArticles.slice(0, this.getCategoryConfig(category)?.maxItems || 20);
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
      
      const html = await this.fetchPage(url);
      const articles = this.parseArticles(html, category);
      
      if (articles.length === 0) {
        return this.createErrorResult('No articles found', category);
      }

      console.log(`    ✅ ${this.config.id}: ${articles.length} items`);
      return this.createSuccessResult(articles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    }
  }
}