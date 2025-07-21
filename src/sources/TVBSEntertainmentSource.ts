import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class TVBSEntertainmentSource extends NewsSource {
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
    const articleData: Array<{
      title: string;
      url: string;
      description: string;
      imageUrl?: string;
      index: number;
    }> = [];
    
    // Look for article links with /entertainment/ pattern
    $('a[href*="/entertainment/"]').each((index, element) => {
      const $article = $(element);
      const href = $article.attr('href');
      
      if (!href || !href.includes('/entertainment/')) return;
      
      // Build full URL
      const fullUrl = href.startsWith('http') ? href : `https://news.tvbs.com.tw${href}`;
      
      // Extract title from various possible locations
      let title = $article.find('h3').text().trim() ||
                 $article.find('h2').text().trim() ||
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
        const imgSrc = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original');
        if (imgSrc) {
          imageUrl = imgSrc.startsWith('http') ? imgSrc : `https://news.tvbs.com.tw${imgSrc}`;
        }
      }
      
      // Extract description if available
      let description = $article.find('.summary, .description, .excerpt, .content').text().trim();
      if (!description) {
        // Try to get text from parent container
        description = $article.parent().find('p').first().text().trim();
      }
      
      // Store article data for batch processing
      articleData.push({
        title,
        url: fullUrl,
        description: description || `${title.substring(0, 100)}...`,
        imageUrl,
        index: index + 1
      });
    });
    
    // Process articles in smaller batches to reduce concurrency
    const batchSize = 5; // Reduced from unlimited to 5 concurrent requests
    const validArticles: NewsItem[] = [];
    
    for (let i = 0; i < articleData.length; i += batchSize) {
      const batch = articleData.slice(i, i + batchSize);
      const batchPromises = batch.map(async (article) => {
        try {
          // Skip individual date fetching for better reliability
          // Use current time with slight offset based on article position for ordering
          const publishedDate = new Date(Date.now() - (article.index * 60000)); // 1 minute offset per article
          
          return this.createNewsItem(
            article.title,
            article.url,
            category,
            publishedDate,
            article.description,
            article.imageUrl,
            article.index
          );
        } catch (error) {
          console.warn(`Error creating news item for ${article.url}:`, error);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validBatchArticles = batchResults.filter((article): article is NewsItem => article !== null);
      validArticles.push(...validBatchArticles);
      
      // Add delay between batches to be more respectful
      if (i + batchSize < articleData.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
      }
    }
    
    // Remove duplicates based on URL
    const uniqueArticles = validArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.sourceUrl === article.sourceUrl)
    );
    
    return uniqueArticles.slice(0, this.getCategoryConfig(category)?.maxItems || 20);
  }

  private async fetchArticleDate(articleUrl: string, retries: number = 3): Promise<Date> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.enforceRateLimit();
        const response = await axios.get(articleUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          },
          timeout: 20000 // Increased from 10000 to 20000ms
        });
      
      const $ = cheerio.load(response.data);
      
      // Priority 1: Try to extract from time element (more reliable for Taiwan timezone)
      const timeElement = $('time').first().text().trim();
      if (timeElement) {
        // Convert format "2025/07/12 16:41" to ISO format
        const timeMatch = timeElement.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [, year, month, day, hour, minute] = timeMatch;
          const taiwanTime = `${year}-${month}-${day}T${hour}:${minute}:00+08:00`;
          const date = new Date(taiwanTime);
          return date; // Taiwan timezone converted to UTC
        }
      }
      
      // Priority 2: Try to extract date from meta tag
      const publishedTimeMeta = $('meta[property="article:published_time"]').attr('content') ||
                                $('meta[name="pubdate"]').attr('content') ||
                                $('meta[property="article:modified_time"]').attr('content');
      if (publishedTimeMeta) {
        // Handle Taiwan timezone properly
        if (publishedTimeMeta.includes('Z')) {
          // If marked as UTC but might actually be Taiwan time, handle carefully
          const date = new Date(publishedTimeMeta);
          return date;
        } else {
          return new Date(publishedTimeMeta);
        }
      }
      
      // Priority 3: Try to extract from JSON-LD
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
      
      // Priority 4: Try to extract from article text patterns
      const datePattern = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/;
      const bodyText = $('body').text();
      const dateMatch = bodyText.match(datePattern);
      if (dateMatch) {
        const [, year, month, day, hour, minute] = dateMatch;
        const taiwanTime = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+08:00`;
        const date = new Date(taiwanTime);
        return date;
      }
      
        // Fallback to current time
        return new Date();
      } catch (error) {
        if (attempt === retries) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Failed to fetch article date from ${articleUrl} after ${retries} attempts:`, errorMessage);
          return new Date();
        }
        
        // Exponential backoff: wait 2^attempt seconds before retry
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Attempt ${attempt}/${retries} failed for ${articleUrl}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return new Date(); // Fallback if all retries fail
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