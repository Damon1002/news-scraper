# Product Overview

Multi-Source News Aggregator is a TypeScript-based news scraping and RSS feed generation system that collects articles from various sources and generates organized RSS feeds.

## Core Functionality

- Scrapes news from multiple source types: RSS feeds, APIs, and web scrapers
- Supports multiple news categories: general, technology, business, world, science, entertainment
- Generates individual RSS feeds per source and category
- Creates a master feed combining all categories (excluding entertainment)
- Produces an HTML index page for feed discovery
- Maintains a feed registry for documentation

## Key Features

- Rate limiting and error handling for reliable scraping
- Deduplication based on normalized article titles
- Configurable update frequencies per source
- Support for both English and Chinese news sources
- GitHub Pages deployment for public RSS access

## Target Use Case

Provides consolidated RSS feeds for news consumption, particularly useful for aggregating entertainment news from Chinese sources and technology news from platforms like Reddit and Hacker News.
