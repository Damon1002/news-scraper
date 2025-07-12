import axios from 'axios';
import { NewsSource } from './NewsSource.js';
import { NewsItem, NewsCategory, ScrapingResult, SourceConfig } from '../types/index.js';

interface HackerNewsItem {
  id: number;
  title: string;
  url?: string;
  text?: string;
  by: string;
  time: number;
  score: number;
  descendants?: number;
  type: string;
}

export class HackerNewsSource extends NewsSource {
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

      const newsItems = await this.scrapeHackerNewsAPI(categoryConfig.endpoint, category, categoryConfig.maxItems);
      return this.createSuccessResult(newsItems, category);
    } catch (error) {
      console.error(`Error scraping Hacker News ${category}:`, error);
      return this.createErrorResult(error instanceof Error ? error.message : 'Unknown error', category);
    }
  }

  private async scrapeHackerNewsAPI(endpoint: string, category: NewsCategory, maxItems: number): Promise<NewsItem[]> {
    const newsItems: NewsItem[] = [];

    try {
      const topStoriesUrl = `${this.config.baseUrl}${endpoint}`;
      const topStoriesResponse = await axios.get<number[]>(topStoriesUrl, {
        timeout: 30000
      });

      const storyIds = topStoriesResponse.data.slice(0, Math.min(maxItems * 2, 30));
      
      const storyPromises = storyIds.map(async (id) => {
        try {
          const storyResponse = await axios.get<HackerNewsItem>(
            `${this.config.baseUrl}/item/${id}.json`,
            { timeout: 10000 }
          );
          return storyResponse.data;
        } catch (error) {
          console.warn(`Failed to fetch story ${id}:`, error);
          return null;
        }
      });

      const stories = await Promise.all(storyPromises);
      const validStories = stories
        .filter((story): story is HackerNewsItem => story !== null)
        .filter(story => this.isValidStory(story))
        .slice(0, maxItems);

      validStories.forEach((story, index) => {
        const publishedAt = new Date(story.time * 1000);
        const description = this.createDescription(story);
        const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;

        const newsItem = this.createNewsItem(
          story.title,
          url,
          category,
          publishedAt,
          description,
          undefined,
          index + 1
        );

        newsItems.push(newsItem);
      });

    } catch (error) {
      console.error('Error scraping Hacker News API:', error);
      throw error;
    }

    return newsItems;
  }

  private createDescription(story: HackerNewsItem): string {
    const parts = [];
    
    if (story.score) {
      parts.push(`${story.score} points`);
    }
    
    if (story.descendants) {
      parts.push(`${story.descendants} comments`);
    }
    
    if (story.by) {
      parts.push(`by ${story.by}`);
    }
    
    parts.push('on Hacker News');
    
    if (story.text && story.text.length > 0) {
      const cleanText = this.stripHtml(story.text);
      if (cleanText.length > 0 && cleanText.length < 200) {
        parts.push(`- ${cleanText.slice(0, 150)}...`);
      }
    }
    
    return parts.join(' ');
  }

  private isValidStory(story: HackerNewsItem): boolean {
    if (!story.title || story.type !== 'story') {
      return false;
    }
    
    if (story.score < 5) {
      return false;
    }
    
    const titleLower = story.title.toLowerCase();
    const skipKeywords = ['ask hn:', 'tell hn:', 'show hn:', 'poll:'];
    if (skipKeywords.some(keyword => titleLower.startsWith(keyword))) {
      return false;
    }
    
    return true;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}