import axios from 'axios';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from '../types/index.js';

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    author: string;
    created_utc: number;
    score: number;
    num_comments: number;
    selftext?: string;
    thumbnail?: string;
    is_self: boolean;
    subreddit: string;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

export class RedditSource extends NewsSource {
  constructor(config: SourceConfig) {
    super(config);
  }

  async scrapeCategory(category: NewsCategory): Promise<ScrapingResult> {
    await this.enforceRateLimit();

    try {
      const categoryConfig = this.config.categories.find(cat => cat.category === category);
      if (!categoryConfig) {
        return this.createErrorResult(`Category ${category} not supported`, category);
      }

      const newsItems = await this.scrapeRedditAPI(categoryConfig.endpoint, category, categoryConfig.maxItems);
      return this.createSuccessResult(newsItems, category);
    } catch (error) {
      console.error(`Error scraping Reddit ${category}:`, error);
      return this.createErrorResult(error instanceof Error ? error.message : 'Unknown error', category);
    }
  }

  private async scrapeRedditAPI(endpoint: string, category: NewsCategory, maxItems: number): Promise<NewsItem[]> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const newsItems: NewsItem[] = [];

    try {
      const response = await axios.get<RedditResponse>(url, {
        headers: {
          'User-Agent': 'NewsAggregator/1.0 (by /u/newsaggregator)',
          ...this.config.headers
        },
        timeout: 30000
      });

      const posts = response.data.data.children;

      posts.slice(0, maxItems).forEach((post, index) => {
        const postData = post.data;
        
        if (!postData.title || this.isLowQualityPost(postData)) {
          return;
        }

        const publishedAt = new Date(postData.created_utc * 1000);
        const description = this.createDescription(postData);
        const url = postData.is_self ? 
          `https://reddit.com${postData.permalink}` : 
          postData.url;

        const newsItem = this.createNewsItem(
          postData.title,
          url,
          category,
          publishedAt,
          description,
          this.getValidImageUrl(postData.thumbnail),
          index + 1
        );

        newsItems.push(newsItem);
      });

    } catch (error) {
      console.error('Error scraping Reddit API:', error);
      throw error;
    }

    return newsItems;
  }

  private createDescription(postData: RedditPost['data']): string {
    const parts = [];
    
    if (postData.score) {
      parts.push(`${postData.score} upvotes`);
    }
    
    if (postData.num_comments) {
      parts.push(`${postData.num_comments} comments`);
    }
    
    parts.push(`from r/${postData.subreddit}`);
    
    if (postData.selftext && postData.selftext.length > 0 && postData.selftext.length < 200) {
      parts.push(`- ${postData.selftext.slice(0, 150)}...`);
    }
    
    return parts.join(' ');
  }

  private isLowQualityPost(postData: RedditPost['data']): boolean {
    if (postData.score < 10) return true;
    
    if (postData.title.toLowerCase().includes('[deleted]') || 
        postData.title.toLowerCase().includes('[removed]')) {
      return true;
    }
    
    const spamKeywords = ['upvote', 'karma', 'reddit gold', 'cake day'];
    const titleLower = postData.title.toLowerCase();
    if (spamKeywords.some(keyword => titleLower.includes(keyword))) {
      return true;
    }
    
    return false;
  }

  private getValidImageUrl(thumbnail?: string): string | undefined {
    if (!thumbnail || 
        thumbnail === 'self' || 
        thumbnail === 'default' || 
        thumbnail === 'nsfw' ||
        thumbnail === 'spoiler' ||
        !thumbnail.startsWith('http')) {
      return undefined;
    }
    
    return thumbnail;
  }
}