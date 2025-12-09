/**
 * Agent Registry - Manages agent aliases and their configurations
 *
 * Supports multiple "personalities" via message prefixes like @claude, @opus, @review
 * Each alias can have different models, system prompts, and behaviors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/agents.json');

export interface AgentConfig {
  model: string;
  systemPrompt: string | null;
  description: string;
}

export interface AgentsConfig {
  aliases: Record<string, AgentConfig>;
  defaultAlias: string;
  triggerPrefix: string;
}

export interface ParsedMessage {
  alias: string;
  content: string;
  agentConfig: AgentConfig;
}

export class AgentRegistry {
  private config: AgentsConfig;

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath || CONFIG_PATH);
  }

  private loadConfig(configPath: string): AgentsConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load agent config from ${configPath}, using defaults`);
      return {
        aliases: {
          claude: {
            model: 'claude-sonnet-4-20250514',
            systemPrompt: null,
            description: 'Default Claude Code agent',
          },
        },
        defaultAlias: 'claude',
        triggerPrefix: '@',
      };
    }
  }

  /**
   * Parse a Discord message to extract alias and content
   * Returns the appropriate agent config
   *
   * Examples:
   *   "@claude help me fix this bug" → alias: "claude", content: "help me fix this bug"
   *   "@opus design the architecture" → alias: "opus", content: "design the architecture"
   *   "just a regular message" → alias: defaultAlias, content: "just a regular message"
   */
  parseMessage(message: string): ParsedMessage {
    const prefix = this.config.triggerPrefix;
    const trimmed = message.trim();

    // Check if message starts with trigger prefix
    if (trimmed.startsWith(prefix)) {
      // Extract potential alias (word after prefix)
      const match = trimmed.match(new RegExp(`^${this.escapeRegex(prefix)}(\\w+)\\s*(.*)$`, 's'));

      if (match) {
        const potentialAlias = match[1].toLowerCase();
        const content = match[2].trim();

        // Check if this is a known alias
        if (this.config.aliases[potentialAlias]) {
          return {
            alias: potentialAlias,
            content: content || '', // Could be empty if just "@claude" with no message
            agentConfig: this.config.aliases[potentialAlias],
          };
        }
      }
    }

    // No alias found, use default
    return {
      alias: this.config.defaultAlias,
      content: trimmed,
      agentConfig: this.getDefaultConfig(),
    };
  }

  /**
   * Check if a message contains a trigger for any agent
   */
  hasTrigger(message: string): boolean {
    const prefix = this.config.triggerPrefix;
    const trimmed = message.trim();

    if (!trimmed.startsWith(prefix)) {
      return false;
    }

    // Check if it matches any known alias
    for (const alias of Object.keys(this.config.aliases)) {
      const pattern = new RegExp(`^${this.escapeRegex(prefix)}${alias}(\\s|$)`, 'i');
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get config for a specific alias
   */
  getConfig(alias: string): AgentConfig | null {
    return this.config.aliases[alias.toLowerCase()] || null;
  }

  /**
   * Get the default agent config
   */
  getDefaultConfig(): AgentConfig {
    return this.config.aliases[this.config.defaultAlias] || {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: null,
      description: 'Default agent',
    };
  }

  /**
   * Get all available aliases
   */
  getAliases(): string[] {
    return Object.keys(this.config.aliases);
  }

  /**
   * Get all aliases with their descriptions
   */
  getAliasDescriptions(): Array<{ alias: string; description: string; model: string }> {
    return Object.entries(this.config.aliases).map(([alias, config]) => ({
      alias,
      description: config.description,
      model: config.model,
    }));
  }

  /**
   * Get the trigger prefix
   */
  getTriggerPrefix(): string {
    return this.config.triggerPrefix;
  }

  /**
   * Get the default alias name
   */
  getDefaultAlias(): string {
    return this.config.defaultAlias;
  }

  /**
   * Reload configuration from disk
   */
  reload(configPath?: string): void {
    this.config = this.loadConfig(configPath || CONFIG_PATH);
    console.log(`Agent registry reloaded: ${Object.keys(this.config.aliases).length} aliases`);
  }

  /**
   * Helper to escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Singleton instance
let instance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!instance) {
    instance = new AgentRegistry();
  }
  return instance;
}
