#!/usr/bin/env node

import { NewsAggregator } from './NewsAggregator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { categories?: string[] } = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--categories=')) {
      const categoriesString = arg.split('=')[1];
      options.categories = categoriesString.split(',').map(c => c.trim());
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