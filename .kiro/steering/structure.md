# Project Structure

## Root Directory

- `package.json` - Dependencies and npm scripts
- `tsconfig.json` - TypeScript configuration with strict mode
- `src/` - Source code directory
- `docs/` - Generated output and GitHub Pages content
- `dist/` - Compiled JavaScript output (generated)

## Source Code Organization (`src/`)

### Core Files

- `main.ts` - Application entry point and CLI interface
- `NewsAggregator.ts` - Main orchestrator class

### Configuration (`src/config/`)

- `sources.json` - Source definitions with endpoints, rate limits, and categories

### Source Implementations (`src/sources/`)

- `NewsSource.ts` - Abstract base class for all news sources
- `*Source.ts` - Concrete implementations for each news source
- Naming convention: `[SourceName]Source.ts` (e.g., `RedditSource.ts`)

### Utilities (`src/utils/`)

- `ConfigLoader.ts` - Configuration management (singleton)
- `RSSGenerator.ts` - RSS feed and HTML generation
- `FeedRegistry.ts` - Feed metadata and documentation management

### Types (`src/types/`)

- `index.ts` - All TypeScript interfaces and enums

## Output Structure (`docs/`)

- `index.html` - Generated feed index page
- `feeds/` - RSS feed directory
  - `master.xml` - Combined feed (excludes entertainment)
  - `[category].xml` - Category-specific feeds
  - `[category]/[source].xml` - Individual source feeds
- `feeds-registry.json` - Feed metadata registry
- `status/latest.md` - Generation status documentation

## Key Conventions

- All source classes extend `NewsSource` abstract class
- Configuration-driven source instantiation in `NewsAggregator`
- Separate feeds generated per source and category
- Rate limiting enforced at the base class level
- Error handling with graceful degradation per source
- Emoji-prefixed console logging for visual clarity
