# Technology Stack

## Core Technologies

- **TypeScript 5.0+** - Primary language with strict mode enabled
- **Node.js** - Runtime environment with ES modules
- **ES2022** target with ESNext modules

## Key Dependencies

- **axios** - HTTP client for API requests and RSS fetching
- **cheerio** - Server-side jQuery implementation for HTML parsing
- **playwright** - Browser automation for complex web scraping
- **ts-node** - TypeScript execution for development

## Build System

- **TypeScript Compiler (tsc)** - Compiles to `dist/` directory
- **ES Modules** - Uses `.js` extensions in imports for compatibility
- Source maps and declarations generated for debugging

## Common Commands

```bash
# Development - run with hot reload
npm run dev

# Production - start compiled application
npm start

# Build - compile TypeScript to JavaScript
npm run build

# Clean - remove generated XML feeds
npm run clean
```

## Architecture Patterns

- **Abstract Factory Pattern** - `NewsSource` base class with concrete implementations
- **Singleton Pattern** - `ConfigLoader` for centralized configuration
- **Strategy Pattern** - Different scraping strategies per source type (RSS, API, scraper)
- **Builder Pattern** - RSS feed generation with metadata builders

## Code Style Conventions

- Use `.js` extensions in TypeScript imports for ES module compatibility
- Async/await preferred over Promises
- Error handling with try/catch and graceful degradation
- Rate limiting implemented in base classes
- Consistent logging with emoji prefixes for visual clarity
