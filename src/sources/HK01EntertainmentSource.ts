import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class HK01EntertainmentSource extends NewsSource {
  private async fetchPage(url: string): Promise<string> {
    await this.enforceRateLimit();
    
    try {
      const response: AxiosResponse<string> = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
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
    
    // Target HK01 content cards - the main article containers
    const contentCards = $('.content-card');
    console.log(`Found ${contentCards.length} content cards on HK01`);
    
    contentCards.each((index, element) => {
      if (index >= 50) return false; // Limit to first 50 articles for performance
      
      const $card = $(element);
      
      // Extract article link
      const $link = $card.find('.card-main a, a').first();
      const href = $link.attr('href');
      
      if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      
      // Build full URL
      const fullUrl = href.startsWith('http') ? href : `https://www.hk01.com${href}`;
      
      // Extract title from card title
      let title = $card.find('.card-title').text().trim() ||
                 $card.find('.card-main .card-title').text().trim() ||
                 $link.text().trim();
      
      // Clean up title
      title = title.replace(/\s+/g, ' ').trim();
      
      if (!title || title.length < 10 || title.length > 200) return;
      
      // Skip common navigation/footer links
      const skipPatterns = ['隱私政策', '使用條款', '聯絡我們', '關於我們', '訂閱', 'Privacy Policy', 'Terms of Service'];
      if (skipPatterns.some(pattern => title.includes(pattern))) return;
      
      // Extract image URL
      let imageUrl: string | undefined;
      const $img = $card.find('.card-image__aspect-ratio img, .card-image img, img').first();
      if ($img.length) {
        const imgSrc = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
        if (imgSrc && !imgSrc.includes('placeholder') && !imgSrc.includes('default')) {
          imageUrl = imgSrc.startsWith('http') ? imgSrc : `https://www.hk01.com${imgSrc}`;
        }
      }
      
      // Extract description if available
      let description = $card.find('.card-description, .card-summary, .card-excerpt').text().trim();
      if (!description) {
        // Try to get text from other elements
        description = $card.find('.card-info').text().trim();
      }
      
      // Store article data for processing
      articleData.push({
        title,
        url: fullUrl,
        description: description || `${title.substring(0, 100)}...`,
        imageUrl,
        index: index + 1
      });
    });
    
    console.log(`Extracted ${articleData.length} valid articles from HK01`);
    
    // Process articles with proper UTC timing
    const validArticles: NewsItem[] = [];
    
    for (const article of articleData) {
      try {
        // Use current time with slight offset based on article position for ordering
        // This assumes more recent articles appear first on the page
        const publishedDate = new Date(Date.now() - (article.index * 60000)); // 1 minute offset per article
        
        const newsItem = this.createNewsItem(
          article.title,
          article.url,
          category,
          publishedDate,
          article.description,
          article.imageUrl,
          article.index
        );
        
        if (newsItem) {
          validArticles.push(newsItem);
        }
      } catch (error) {
        console.warn(`Error creating news item for ${article.url}:`, error);
      }
    }
    
    // Remove duplicates based on URL
    const uniqueArticles = validArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.sourceUrl === article.sourceUrl)
    );
    
    return uniqueArticles.slice(0, this.getCategoryConfig(category)?.maxItems || 30);
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

      console.log(`    ✅ ${this.config.id}: ${articles.length} entertainment items`);
      return this.createSuccessResult(articles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    }
  }
}