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
- **Standardized UTC timestamps**: All publication dates converted to UTC format for consistent external API consumption

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

## Timezone Standardization Requirements

**CRITICAL**: All RSS feeds must use standardized UTC timestamps to ensure consistent external API consumption.

### Implementation Requirements:

1. **UTC Conversion**: All news sources must convert their local publication times to UTC before generating RSS feeds
2. **Format Standard**: Use RFC 2822 format with `+0000` timezone indicator (e.g., `Sat, 12 Jul 2025 14:37:00 +0000`)
3. **Source-Specific Handling**: Each news source must handle timezone conversion appropriately:
   - **Taiwan sources** (e.g., SETN): Convert from Taiwan time (UTC+8) to UTC
   - **US sources**: Convert from respective local timezones to UTC  
   - **European sources**: Convert from respective local timezones to UTC
   - **API sources**: Verify timezone information and convert if necessary

### Technical Implementation:

- Use JavaScript `Date` constructor with proper timezone offset (e.g., `new Date('2025-07-12T22:37:00+08:00')`)
- Leverage `toUTCString()` method for automatic UTC conversion
- Replace `GMT` with `+0000` in RSS date formatting for standard compliance
- Prioritize reliable time sources (e.g., `<time>` elements over potentially incorrect meta tags)

### Benefits:

- **External API Compatibility**: Consistent timezone format enables seamless integration with third-party systems
- **Cross-Platform Reliability**: Eliminates timezone confusion for RSS feed consumers
- **Data Consistency**: Ensures all news items have comparable timestamps regardless of source origin
- **International Usability**: Makes feeds usable across different geographic regions without timezone conversion overhead

## Adding New Sources

1. Create new source class extending `NewsSource`
2. Implement `scrapeCategory()` method with proper UTC timezone conversion
3. Add source configuration to `src/config/sources.json`
4. Update factory method in `NewsAggregator.createSource()`
5. **MANDATORY**: Ensure all publication dates are converted to UTC format before returning NewsItem objects

## RSS Feed URLs

- **Master Feed**: `https://damon1002.github.io/google-news-scraper/feeds/master.xml`
- **Technology**: `https://damon1002.github.io/google-news-scraper/feeds/technology.xml`
- **Business**: `https://damon1002.github.io/google-news-scraper/feeds/business.xml`
- **World**: `https://damon1002.github.io/google-news-scraper/feeds/world.xml`
- **Science**: `https://damon1002.github.io/google-news-scraper/feeds/science.xml`
- **Health**: `https://damon1002.github.io/google-news-scraper/feeds/health.xml`