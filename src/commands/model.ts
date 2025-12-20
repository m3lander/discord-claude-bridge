/**
 * /model Command Handler
 *
 * Changes the AI model for the current thread session.
 * The model override persists for all future messages in the thread.
 */

import {
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { getSessionManager } from '../core/session-manager.js';
import { getAgentRegistry } from '../core/agent-registry.js';

export async function handleModelCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Must be used in a thread
  if (
    interaction.channel?.type !== ChannelType.PublicThread &&
    interaction.channel?.type !== ChannelType.PrivateThread
  ) {
    await interaction.reply({
      content: '`/model` can only be used inside a thread with an active session.',
      ephemeral: true,
    });
    return;
  }

  const threadId = interaction.channelId;
  const sessionManager = getSessionManager();
  const session = sessionManager.getSession(threadId);

  if (!session) {
    await interaction.reply({
      content: 'No active session in this thread. Start a conversation first.',
      ephemeral: true,
    });
    return;
  }

  const newModel = interaction.options.getString('model', true);
  const agentRegistry = getAgentRegistry();

  // Get model description from agent registry
  const modelConfig = agentRegistry.getConfig(newModel);
  const description = modelConfig?.description || newModel;

  // Update session with model override
  sessionManager.updateSessionModel(threadId, newModel);

  await interaction.reply({
    content: `**Model changed to \`${newModel}\`** (${description})\n\nAll future messages in this thread will use this model.`,
    ephemeral: false, // Visible to all so everyone knows
  });
}
