/**
 * Channel Router - Maps Discord channels to filesystem directories
 *
 * Reads configuration from channels.json and provides lookup functionality.
 * Channels mapped to directories inherit that directory's CLAUDE.md, skills, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/channels.json');

export interface ChannelMapping {
  channelId: string;
  directory: string;
  description?: string;
}

export interface ChannelConfig {
  mappings: ChannelMapping[];
  defaultDirectory: string;
}

export class ChannelRouter {
  private config: ChannelConfig;
  private mappingCache: Map<string, ChannelMapping>;

  constructor(configPath?: string) {
    this.mappingCache = new Map();
    this.config = this.loadConfig(configPath || CONFIG_PATH);
    this.buildCache();
  }

  private loadConfig(configPath: string): ChannelConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load channel config from ${configPath}, using defaults`);
      return {
        mappings: [],
        defaultDirectory: process.env.HOME || '/tmp',
      };
    }
  }

  private buildCache(): void {
    this.mappingCache.clear();
    for (const mapping of this.config.mappings) {
      this.mappingCache.set(mapping.channelId, mapping);
    }
  }

  /**
   * Get the directory mapped to a channel
   * Falls back to defaultDirectory if no mapping exists
   */
  getDirectory(channelId: string): string {
    const mapping = this.mappingCache.get(channelId);
    return mapping?.directory || this.config.defaultDirectory;
  }

  /**
   * Get full mapping info for a channel
   */
  getMapping(channelId: string): ChannelMapping | null {
    return this.mappingCache.get(channelId) || null;
  }

  /**
   * Check if a channel has an explicit mapping
   */
  hasMapping(channelId: string): boolean {
    return this.mappingCache.has(channelId);
  }

  /**
   * Get all configured mappings
   */
  getAllMappings(): ChannelMapping[] {
    return [...this.config.mappings];
  }

  /**
   * Get the default directory
   */
  getDefaultDirectory(): string {
    return this.config.defaultDirectory;
  }

  /**
   * Reload configuration from disk
   * Useful if config is updated while bot is running
   */
  reload(configPath?: string): void {
    this.config = this.loadConfig(configPath || CONFIG_PATH);
    this.buildCache();
    console.log(`Channel router reloaded: ${this.config.mappings.length} mappings`);
  }

  /**
   * Add a mapping at runtime (not persisted to disk)
   */
  addMapping(mapping: ChannelMapping): void {
    // Update config
    const existingIndex = this.config.mappings.findIndex(m => m.channelId === mapping.channelId);
    if (existingIndex >= 0) {
      this.config.mappings[existingIndex] = mapping;
    } else {
      this.config.mappings.push(mapping);
    }

    // Update cache
    this.mappingCache.set(mapping.channelId, mapping);
  }

  /**
   * Save current configuration to disk
   */
  saveConfig(configPath?: string): void {
    const targetPath = configPath || CONFIG_PATH;
    fs.writeFileSync(targetPath, JSON.stringify(this.config, null, 2));
    console.log(`Channel configuration saved to ${targetPath}`);
  }

  /**
   * Validate that all mapped directories exist
   */
  validateMappings(): { valid: ChannelMapping[]; invalid: ChannelMapping[] } {
    const valid: ChannelMapping[] = [];
    const invalid: ChannelMapping[] = [];

    for (const mapping of this.config.mappings) {
      if (fs.existsSync(mapping.directory)) {
        valid.push(mapping);
      } else {
        invalid.push(mapping);
      }
    }

    return { valid, invalid };
  }
}

// Singleton instance
let instance: ChannelRouter | null = null;

export function getChannelRouter(): ChannelRouter {
  if (!instance) {
    instance = new ChannelRouter();
  }
  return instance;
}
