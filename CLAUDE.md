# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google News scraper built in TypeScript that extracts US headlines using two methods:
1. **RSS Feed Scraping** (primary method) - More reliable, uses Google News RSS feed
2. **Dynamic Web Scraping** (fallback) - Uses Playwright for browser automation when RSS fails

The scraper outputs news items to console and exports them as JSON files.

## Development Commands

- **Run the scraper**: `npm start` (uses ts-node to run TypeScript directly)
- **Build TypeScript**: `npm run build` (compiles to JavaScript using tsc)

## Architecture

### Core Components

- **GoogleNewsScraper class** (`google-news-scraper.ts`): Main scraper with two scraping strategies
  - `scrapeRSSFeed()`: Primary method using axios + cheerio for RSS parsing
  - `scrapeWithPlaywright()`: Fallback method using browser automation
  - `initialize()`: Sets up Playwright browser with anti-detection measures
  - `displayNews()`: Console output formatting
  - `exportToJSON()`: JSON file export functionality

### Dependencies

- **axios**: HTTP requests for RSS feed
- **cheerio**: XML/HTML parsing for RSS content
- **playwright**: Browser automation for dynamic content
- **TypeScript**: Language and build toolchain

### Data Flow

1. Attempts RSS feed scraping first (more reliable and faster)
2. Falls back to Playwright browser scraping if RSS returns no results
3. Processes and formats news data into standardized NewsItem interface
4. Outputs to console with formatted display
5. Exports structured data to JSON file

### Key Features

- Anti-detection measures (custom user agents, headless browsing)
- Dual scraping strategies for reliability
- Time formatting (relative time display)
- Structured data export
- Error handling and graceful fallbacks

## File Structure

- `google-news-scraper.ts`: Single main file containing all functionality
- `package.json`: Dependencies and npm scripts
- Generated output: `google_news.json` (created when scraper runs)