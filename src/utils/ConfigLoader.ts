import { readFileSync } from 'fs';
import { SourceConfig, NewsCategory } from '../types/index.js';

export interface GlobalConfig {
  maxItemsPerFeed: number;
  defaultUpdateFrequency: number;
  enabledCategories: NewsCategory[];
  outputDirectory: string;
  baseUrl: string;
}

export interface AppConfig {
  sources: SourceConfig[];
  global: GlobalConfig;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(configPath: string = 'src/config/sources.json'): AppConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const configData = readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(configData) as AppConfig;
      
      this.validateConfig(this.config);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  private validateConfig(config: AppConfig): void {
    if (!config.sources || !Array.isArray(config.sources)) {
      throw new Error('Invalid configuration: sources must be an array');
    }

    if (!config.global) {
      throw new Error('Invalid configuration: global config is required');
    }

    for (const source of config.sources) {
      if (!source.id || !source.name || !source.type) {
        throw new Error(`Invalid source configuration: ${JSON.stringify(source)}`);
      }

      if (!source.categories || !Array.isArray(source.categories)) {
        throw new Error(`Invalid source categories: ${source.id}`);
      }
    }
  }

  public getEnabledSources(): SourceConfig[] {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config.sources.filter(source => source.enabled);
  }

  public getSourceById(id: string): SourceConfig | undefined {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config.sources.find(source => source.id === id);
  }

  public getGlobalConfig(): GlobalConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config.global;
  }

  public getEnabledCategories(): NewsCategory[] {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config.global.enabledCategories;
  }

  public getCategoryUpdateFrequency(sourceId: string, category: NewsCategory): number {
    const source = this.getSourceById(sourceId);
    if (!source) {
      return this.getGlobalConfig().defaultUpdateFrequency;
    }

    const categoryConfig = source.categories.find(cat => cat.category === category);
    return categoryConfig?.updateFrequency || this.getGlobalConfig().defaultUpdateFrequency;
  }
}