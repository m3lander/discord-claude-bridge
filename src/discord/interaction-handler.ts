/**
 * Interaction Handler - Routes slash commands and component interactions
 *
 * Listens for InteractionCreate events and dispatches to appropriate handlers.
 * Button and select menu interactions are handled inline by the command handlers
 * using awaitMessageComponent().
 */

import {
  Client,
  Events,
  Interaction,
} from 'discord.js';
import { handleModelCommand } from '../commands/model.js';
import { handleClearCommand } from '../commands/clear.js';
import { handleResumeCommand } from '../commands/resume.js';

export class InteractionHandler {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await this.handleInteraction(interaction);
    });
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      try {
        switch (interaction.commandName) {
          case 'model':
            await handleModelCommand(interaction);
            break;
          case 'clear':
            await handleClearCommand(interaction);
            break;
          case 'resume':
            await handleResumeCommand(interaction);
            break;
          default:
            console.warn(`[InteractionHandler] Unknown command: ${interaction.commandName}`);
            await interaction.reply({
              content: 'Unknown command.',
              ephemeral: true,
            });
        }
      } catch (error) {
        console.error(`[InteractionHandler] Error handling command ${interaction.commandName}:`, error);

        const errorMessage = 'Something went wrong processing your command.';

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    }

    // Note: Button and SelectMenu interactions are handled inline in command handlers
    // using awaitMessageComponent(), not here. This keeps the logic co-located.
  }
}

/**
 * Create and attach an interaction handler to a Discord client
 */
export function createInteractionHandler(client: Client): InteractionHandler {
  return new InteractionHandler(client);
}
