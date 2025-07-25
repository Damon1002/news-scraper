import { chromium, Browser, BrowserContext } from 'playwright';

export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private readonly maxContexts = 3;

  private constructor() {}

  public static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  public async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log('🚀 Initializing shared browser instance...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      console.log('✅ Shared browser instance ready');
    }
    return this.browser;
  }

  public async getContext(): Promise<BrowserContext> {
    const browser = await this.initBrowser();
    
    // Reuse existing context if available
    if (this.contexts.length < this.maxContexts) {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        // Optimize for performance
        bypassCSP: true,
        javaScriptEnabled: true
      });
      
      this.contexts.push(context);
      console.log(`📱 Created new browser context (${this.contexts.length}/${this.maxContexts})`);
      return context;
    } else {
      // Return existing context (round-robin)
      const context = this.contexts[Math.floor(Math.random() * this.contexts.length)];
      console.log(`♻️  Reusing existing browser context`);
      return context;
    }
  }

  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up browser pool...');
    
    // Close all contexts
    for (const context of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        console.warn('⚠️  Error closing context:', error);
      }
    }
    this.contexts = [];
    
    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        console.log('✅ Browser pool cleaned up');
      } catch (error) {
        console.warn('⚠️  Error closing browser:', error);
      }
    }
  }

  public getStats(): { 
    browserActive: boolean; 
    contextCount: number; 
    maxContexts: number; 
  } {
    return {
      browserActive: this.browser !== null,
      contextCount: this.contexts.length,
      maxContexts: this.maxContexts
    };
  }
}