import axios from 'axios';
import * as cheerio from 'cheerio';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult } from '../types/index.js';

export class TwitterRSSSource extends NewsSource {
  private nitterInstances = [
    'https://nitter.net',
    'https://nitter.it', 
    'https://nitter.unixfox.eu',
    'https://nitter.domain.glass'
  ];

  private async fetchRSSFeedWithFallback(username: string): Promise<string> {
    await this.enforceRateLimit();
    
    for (const instance of this.nitterInstances) {
      try {
        const url = `${instance}/${username}/rss`;
        console.log(`      🔄 Trying ${instance} for @${username}...`);
        
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        if (response.data && response.data.includes('<rss')) {
          console.log(`      ✅ Success with ${instance}`);
          return response.data;
        }
      } catch (error) {
        console.warn(`      ⚠️  ${instance} failed:`, error instanceof Error ? error.message : error);
        continue;
      }
    }
    
    throw new Error(`All Nitter instances failed for @${username}`);
  }

  private parseRSSFeed(rssContent: string, category: NewsCategory, username: string): NewsItem[] {
    const $ = cheerio.load(rssContent, { xmlMode: true });
    const articles: NewsItem[] = [];
    
    $('item').each((index, element) => {
      try {
        const title = $(element).find('title').text().trim();
        const link = $(element).find('link').text().trim();
        const description = $(element).find('description').text().trim();
        const pubDateStr = $(element).find('pubDate').text().trim();
        
        if (!title || !link) return;
        
        // Parse publication date and convert to UTC
        let publishedAt: Date;
        try {
          publishedAt = new Date(pubDateStr);
          // Ensure we have a valid date
          if (isNaN(publishedAt.getTime())) {
            publishedAt = new Date();
          }
        } catch {
          publishedAt = new Date();
        }
        
        // Skip retweets if we want only original content
        if (title.toLowerCase().includes('rt @') || description.toLowerCase().includes('rt @')) {
          return; // Skip retweets for cleaner feeds
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
          // Add Twitter-specific tags
          newsItem.tags.push(`@${username}`, 'twitter', 'nitter', 'social');
          articles.push(newsItem);
        }
      } catch (error) {
        console.warn(`Error parsing RSS item for @${username}:`, error);
      }
    });
    
    return articles;
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

      console.log(`  🔄 Scraping ${this.config.id} for ${category}...`);
      
      // Get list of Twitter accounts from config
      const accounts = (this.config as any).accounts || [];
      const allArticles: NewsItem[] = [];
      let successfulAccounts = 0;
      
      // Scrape RSS feeds for each Twitter account
      for (const account of accounts) {
        try {
          console.log(`    📱 Fetching RSS for @${account.username}...`);
          
          const rssContent = await this.fetchRSSFeedWithFallback(account.username);
          const articles = this.parseRSSFeed(rssContent, category, account.username);
          
          allArticles.push(...articles);
          successfulAccounts++;
          console.log(`    ✅ @${account.username}: ${articles.length} tweets`);
        } catch (error) {
          console.warn(`    ⚠️  Failed to fetch RSS for @${account.username}:`, error instanceof Error ? error.message : error);
        }
        
        // Add delay between accounts to avoid overwhelming Nitter instances
        if (accounts.indexOf(account) < accounts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (allArticles.length === 0) {
        if (successfulAccounts === 0) {
          return this.createErrorResult('Failed to fetch RSS from all accounts', category);
        } else {
          return this.createErrorResult('No tweets found from any account', category);
        }
      }

      // Sort by publication date (newest first) and limit total items
      const sortedArticles = allArticles
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, categoryConfig.maxItems || 50);

      console.log(`    ✅ ${this.config.id}: ${sortedArticles.length} total tweets from ${successfulAccounts}/${accounts.length} accounts`);
      return this.createSuccessResult(sortedArticles, category);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`    ❌ ${this.config.id}: ${errorMessage}`);
      return this.createErrorResult(errorMessage, category);
    }
  }
}