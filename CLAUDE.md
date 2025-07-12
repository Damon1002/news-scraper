# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Multi-Source News Aggregation System** built in TypeScript that extracts news from multiple sources and generates RSS feeds for different categories. The system supports:

1. **Google News** - RSS feeds for multiple categories (General, Tech, Business, World, Science, Health)
2. **Reddit** - Hot posts from news subreddits (r/technology, r/worldnews, r/science, r/business)
3. **Hacker News** - Top technology stories via API
4. **Extensible Architecture** - Easy to add new news sources

The system generates category-specific RSS feeds and a master feed, automatically hosted on GitHub Pages with hourly updates.

## Development Commands

- **Run the aggregator**: `npm start` - Scrapes all sources and generates RSS feeds
- **Development mode**: `npm run dev` - Same as start, for development
- **Build TypeScript**: `npm run build` - Compiles TypeScript to JavaScript
- **Clean feeds**: `npm run clean` - Removes generated feed files

## Architecture

### Core Components

**Main Classes:**
- **NewsAggregator** (`src/NewsAggregator.ts`): Orchestrates the entire aggregation process
- **NewsSource** (`src/sources/NewsSource.ts`): Abstract base class for all news sources
- **RSSGenerator** (`src/utils/RSSGenerator.ts`): Generates RSS XML feeds and HTML index
- **ConfigLoader** (`src/utils/ConfigLoader.ts`): Manages source configuration

**News Sources:**
- **GoogleNewsSource** (`src/sources/GoogleNewsSource.ts`): RSS + Playwright fallback
- **RedditSource** (`src/sources/RedditSource.ts`): Reddit API integration
- **HackerNewsSource** (`src/sources/HackerNewsSource.ts`): Hacker News API integration

### Configuration System

**Source Configuration** (`src/config/sources.json`):
- **sources**: Array of news source configurations
- **global**: Global settings (max items, update frequencies, output directory)
- **categories**: Supported news categories and their endpoints

### Data Flow

1. **Initialize**: Load configuration and create source instances
2. **Scrape**: Parallel scraping of all sources for each category
3. **Consolidate**: Deduplicate and rank news items
4. **Generate**: Create RSS feeds for each category + master feed
5. **Deploy**: GitHub Actions commits feeds and deploys to GitHub Pages

### RSS Feed Output

**Generated Files** (`docs/feeds/`):
- `master.xml`: Combined feed from all sources and categories
- `technology.xml`: Technology news only
- `business.xml`: Business news only
- `world.xml`: World news only
- `science.xml`: Science news only
- `health.xml`: Health news only
- `general.xml`: General news

**Feed Discovery** (`docs/index.html`): Auto-generated index page with links to all feeds

### Automation

**GitHub Actions** (`.github/workflows/update-feeds.yml`):
- **Schedule**: Runs every hour via cron
- **Process**: Install deps → Scrape news → Generate feeds → Commit → Deploy to Pages
- **Output**: RSS feeds hosted at `https://damon1002.github.io/google-news-scraper/`

## Key Features

- **Multi-source aggregation**: Combines Google News, Reddit, and Hacker News
- **Category organization**: Separate feeds for different news topics
- **Deduplication**: Prevents duplicate stories across sources
- **Rate limiting**: Respects source API limits and terms of service
- **Error handling**: Graceful fallbacks when sources fail
- **GitHub Pages hosting**: Free, reliable RSS feed hosting
- **Automated updates**: Hourly refresh via GitHub Actions

## File Structure

```
src/
├── main.ts                 # Main entry point
├── NewsAggregator.ts       # Core aggregation logic
├── types/index.ts          # TypeScript interfaces
├── sources/                # News source implementations
│   ├── NewsSource.ts       # Abstract base class
│   ├── GoogleNewsSource.ts # Google News integration
│   ├── RedditSource.ts     # Reddit API integration
│   └── HackerNewsSource.ts # Hacker News API integration
├── utils/                  # Utility classes
│   ├── RSSGenerator.ts     # RSS XML generation
│   └── ConfigLoader.ts     # Configuration management
└── config/
    └── sources.json        # Source configurations

docs/                       # GitHub Pages output
├── index.html             # Feed discovery page
└── feeds/                 # Generated RSS feeds

.github/workflows/
└── update-feeds.yml       # Automated update workflow
```

## Adding New Sources

1. Create new source class extending `NewsSource`
2. Implement `scrapeCategory()` method
3. Add source configuration to `src/config/sources.json`
4. Update factory method in `NewsAggregator.createSource()`

## RSS Feed URLs

- **Master Feed**: `https://damon1002.github.io/google-news-scraper/feeds/master.xml`
- **Technology**: `https://damon1002.github.io/google-news-scraper/feeds/technology.xml`
- **Business**: `https://damon1002.github.io/google-news-scraper/feeds/business.xml`
- **World**: `https://damon1002.github.io/google-news-scraper/feeds/world.xml`
- **Science**: `https://damon1002.github.io/google-news-scraper/feeds/science.xml`
- **Health**: `https://damon1002.github.io/google-news-scraper/feeds/health.xml`