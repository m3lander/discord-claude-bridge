/**
 * Command Registration
 *
 * Registers slash commands with Discord via the REST API.
 * Supports both guild-specific and global registration.
 */

import { REST, Routes } from 'discord.js';
import { allCommands } from './definitions.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/guilds.json');

interface GuildConfig {
  guildIds: string[];
  registerGlobally: boolean;
}

function loadGuildConfig(): GuildConfig {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { guildIds: [], registerGlobally: false };
  }
}

/**
 * Register slash commands with Discord
 */
export async function registerCommands(clientId: string, token: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const config = loadGuildConfig();
  const commandData = allCommands.map(cmd => cmd.toJSON());

  console.log(`  Registering ${commandData.length} slash commands...`);

  if (config.registerGlobally) {
    // Global registration (takes up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    console.log('    Registered globally');
  } else if (config.guildIds.length > 0) {
    // Guild-specific registration (instant)
    for (const guildId of config.guildIds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commandData }
        );
        console.log(`    Registered to guild ${guildId}`);
      } catch (error) {
        console.error(`    Failed to register to guild ${guildId}:`, error);
      }
    }
  } else {
    console.log('    No guild IDs configured - skipping registration');
    console.log('    Add guild IDs to src/config/guilds.json to enable slash commands');
  }
}

export { allCommands } from './definitions.js';
