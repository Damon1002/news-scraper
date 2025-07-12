#!/usr/bin/env node

import { NewsAggregator } from './NewsAggregator.js';

async function main() {
  const aggregator = new NewsAggregator();

  try {
    console.log('🚀 Starting Multi-Source News Aggregator...\n');

    await aggregator.initialize();
    aggregator.displayStats();
    
    await aggregator.aggregateNews();
    
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