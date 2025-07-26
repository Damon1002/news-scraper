#!/usr/bin/env node

import { NewsAggregator } from './NewsAggregator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { categories?: string[]; cacheCheckOnly?: boolean } = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--categories=')) {
      const categoriesString = arg.split('=')[1];
      options.categories = categoriesString.split(',').map(c => c.trim());
    } else if (arg === '--cache-check-only') {
      options.cacheCheckOnly = true;
    }
  }
  
  return options;
}

async function main() {
  const options = parseArgs();
  const aggregator = new NewsAggregator();

  try {
    console.log('🚀 Starting Multi-Source News Aggregator...\n');
    
    if (options.categories) {
      console.log(`🎯 Filtering to categories: ${options.categories.join(', ')}`);
    }

    await aggregator.initialize();
    
    // If cache-check-only mode is enabled, check if updates are needed
    if (options.cacheCheckOnly) {
      console.log('🔍 Running cache-only check mode...');
      const hasChanges = await aggregator.checkForChanges();
      if (!hasChanges) {
        console.log('✅ All feeds are up-to-date, skipping aggregation');
        process.exit(0);
      } else {
        console.log('🔄 Changes detected, cache check complete');
        process.exit(1); // Exit with code 1 to indicate changes are needed
      }
    }
    
    aggregator.displayStats();
    await aggregator.aggregateNews(options.categories);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await aggregator.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { NewsAggregator };