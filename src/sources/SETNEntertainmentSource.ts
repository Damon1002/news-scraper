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

  private async parseArticlesWithDates(html: string, category: NewsCategory): Promise<NewsItem[]> {
    const $ = cheerio.load(html);
    const articles: NewsItem[] = [];
    const articlePromises: Promise<NewsItem | null>[] = [];
    
    // Look for article links with /news/ pattern
    $('a[href*="/news/"]').each((index, element) => {
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
      
      // Create promise to fetch article date
      const articlePromise = this.fetchArticleDate(fullUrl).then(publishedDate => {
        return this.createNewsItem(
          title,
          fullUrl,
          category,
          publishedDate,
          description || `${title.substring(0, 100)}...`,
          imageUrl,
          index + 1
        );
      }).catch(error => {
        console.warn(`Error fetching date for ${fullUrl}:`, error);
        // Fallback to current time if date fetch fails
        return this.createNewsItem(
          title,
          fullUrl,
          category,
          new Date(),
          description || `${title.substring(0, 100)}...`,
          imageUrl,
          index + 1
        );
      });
      
      articlePromises.push(articlePromise);
    });
    
    // Wait for all article date fetches to complete
    const resolvedArticles = await Promise.all(articlePromises);
    const validArticles = resolvedArticles.filter((article): article is NewsItem => article !== null);
    
    // Remove duplicates based on URL
    const uniqueArticles = validArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.sourceUrl === article.sourceUrl)
    );
    
    return uniqueArticles.slice(0, this.getCategoryConfig(category)?.maxItems || 20);
  }

  private async fetchArticleDate(articleUrl: string): Promise<Date> {
    try {
      await this.enforceRateLimit();
      const response = await axios.get(articleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Try to extract date from meta tag
      const publishedTimeMeta = $('meta[property="article:published_time"]').attr('content');
      if (publishedTimeMeta) {
        return new Date(publishedTimeMeta);
      }
      
      // Try to extract from time element
      const timeElement = $('time').first().text().trim();
      if (timeElement) {
        // Convert format "2025/07/12 16:41" to ISO format
        const timeMatch = timeElement.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [, year, month, day, hour, minute] = timeMatch;
          return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+08:00`); // Taiwan timezone
        }
      }
      
      // Try to extract from JSON-LD
      const jsonLd = $('script[type="application/ld+json"]').text();
      if (jsonLd) {
        try {
          const data = JSON.parse(jsonLd);
          if (data.datePublished) {
            return new Date(data.datePublished);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      // Fallback to current time
      return new Date();
    } catch (error) {
      console.warn(`Failed to fetch article date from ${articleUrl}:`, error);
      return new Date();
    }
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
      const articles = await this.parseArticlesWithDates(html, category);
      
      if (articles.length === 0) {
        return this.createErrorResult('No articles found', category);
      }

      console.log(`    ✅ ${this.config.id}: ${articles.length} items with real publish dates`);
      return this.createSuccessResult(articles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    }
  }
}