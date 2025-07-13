import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class DailyMailTVShowbizSource extends NewsSource {
  private async fetchPage(url: string): Promise<string> {
    await this.enforceRateLimit();
    
    try {
      const response: AxiosResponse<string> = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
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
    
    // Look for article links with /tvshowbiz/article- pattern
    $('a[href*="/tvshowbiz/article-"]').each((index, element) => {
      const $article = $(element);
      const href = $article.attr('href');
      
      if (!href || !href.includes('/tvshowbiz/article-')) return;
      
      // Build full URL
      const fullUrl = href.startsWith('http') ? href : `https://www.dailymail.co.uk${href}`;
      
      // Extract title from various possible locations
      let title = $article.find('h2').text().trim() ||
                 $article.find('h3').text().trim() ||
                 $article.find('.linkro-darkred').text().trim() ||
                 $article.find('[class*="headline"]').text().trim() ||
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
          imageUrl = imgSrc.startsWith('http') ? imgSrc : `https://www.dailymail.co.uk${imgSrc}`;
        }
      }
      
      // Extract description if available
      let description = $article.find('.news-summary, .summary, .description').text().trim();
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
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Priority 1: Try to extract from time element
      const timeElement = $('time').first();
      if (timeElement.length) {
        const dateTimeAttr = timeElement.attr('datetime');
        if (dateTimeAttr) {
          return new Date(dateTimeAttr);
        }
        
        const timeText = timeElement.text().trim();
        if (timeText) {
          // Parse various date formats Daily Mail might use
          const date = new Date(timeText);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
      
      // Priority 2: Try to extract date from meta tag
      const publishedTimeMeta = $('meta[property="article:published_time"]').attr('content') ||
                                $('meta[name="pubdate"]').attr('content') ||
                                $('meta[property="article:modified_time"]').attr('content');
      if (publishedTimeMeta) {
        return new Date(publishedTimeMeta);
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
      
      // Priority 4: Try to extract from Daily Mail date patterns
      const datePattern = /(\d{1,2}):(\d{2})\s+(GMT|BST),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/;
      const bodyText = $('body').text();
      const dateMatch = bodyText.match(datePattern);
      if (dateMatch) {
        const [, hour, minute, timezone, day, month, year] = dateMatch;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(month.toLowerCase()));
        if (monthIndex !== -1) {
          const utcTime = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00Z`;
          return new Date(utcTime);
        }
      }
      
      // Priority 5: Try to extract from URL date pattern (if any)
      const urlDateMatch = articleUrl.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (urlDateMatch) {
        const [, year, month, day] = urlDateMatch;
        const utcTime = `${year}-${month}-${day}T12:00:00Z`;
        return new Date(utcTime);
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