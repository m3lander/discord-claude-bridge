/**
 * Discord-Claude Bridge
 *
 * Main entry point - initializes the Discord bot and connects to Claude Code
 */

import 'dotenv/config';
import { Events } from 'discord.js';
import { createDiscordClient } from './discord/message-handler.js';
import { createInteractionHandler } from './discord/interaction-handler.js';
import { getChannelRouter } from './core/channel-router.js';
import { getAgentRegistry } from './core/agent-registry.js';
import { getSessionManager } from './core/session-manager.js';
import { registerCommands } from './commands/index.js';

// Validate environment
function validateEnvironment(): void {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'ANTHROPIC_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nPlease copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// Initialize components
function initializeComponents(): void {
  console.log('Initializing components...');

  // Channel router
  const channelRouter = getChannelRouter();
  const { valid, invalid } = channelRouter.validateMappings();
  console.log(`  Channel mappings: ${valid.length} valid, ${invalid.length} invalid`);
  if (invalid.length > 0) {
    console.warn('  Warning: Invalid channel mappings (directory not found):');
    invalid.forEach(m => console.warn(`    - ${m.channelId} → ${m.directory}`));
  }

  // Agent registry
  const agentRegistry = getAgentRegistry();
  const aliases = agentRegistry.getAliases();
  console.log(`  Agent aliases: ${aliases.join(', ')}`);

  // Session manager
  const sessionManager = getSessionManager();
  const recentSessions = sessionManager.getRecentSessions(5);
  console.log(`  Recent sessions: ${recentSessions.length}`);
}

// Main startup
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Discord-Claude Bridge v0.1.0     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Validate environment
  validateEnvironment();
  console.log('✓ Environment validated');

  // Initialize components
  initializeComponents();
  console.log('✓ Components initialized');

  // Create Discord client
  const { client } = createDiscordClient({
    requireTrigger: true,
    autoCreateThreads: true,
    threadArchiveDuration: 1440, // 24 hours
  });

  // Create interaction handler for slash commands
  createInteractionHandler(client);

  // Register slash commands
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const token = process.env.DISCORD_BOT_TOKEN!;
  await registerCommands(clientId, token);
  console.log('✓ Slash commands registered');

  // Setup event handlers
  client.once(Events.ClientReady, (readyClient) => {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✓ Logged in as ${readyClient.user.tag}`);
    console.log(`  Guilds: ${readyClient.guilds.cache.size}`);
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('Bot is ready! Send a message with @claude to start.');
    console.log('');

    // List connected guilds
    readyClient.guilds.cache.forEach(guild => {
      console.log(`  📍 ${guild.name} (${guild.id})`);
    });
  });

  client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
  });

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    client.destroy();
    getSessionManager().close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    client.destroy();
    getSessionManager().close();
    process.exit(0);
  });

  // Connect to Discord
  console.log('Connecting to Discord...');
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
