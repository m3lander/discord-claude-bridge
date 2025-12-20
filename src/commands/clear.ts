/**
 * /clear Command Handler
 *
 * Clears the current session and starts fresh.
 * Shows a confirmation dialog before clearing.
 */

import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChannelType,
} from 'discord.js';
import { getSessionManager } from '../core/session-manager.js';

export async function handleClearCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Must be used in a thread
  if (
    interaction.channel?.type !== ChannelType.PublicThread &&
    interaction.channel?.type !== ChannelType.PrivateThread
  ) {
    await interaction.reply({
      content: '`/clear` can only be used inside a thread.',
      ephemeral: true,
    });
    return;
  }

  const threadId = interaction.channelId;
  const sessionManager = getSessionManager();
  const session = sessionManager.getSession(threadId);

  if (!session) {
    await interaction.reply({
      content: 'No active session in this thread.',
      ephemeral: true,
    });
    return;
  }

  // Build confirmation buttons
  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('clear_confirm')
      .setLabel('Clear Session')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('clear_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    content: `**Clear session?**\n\nThis will delete the session history (${session.messageCount} messages). The thread will remain, but Claude will start fresh with no memory of previous messages.\n\n*This cannot be undone.*`,
    components: [confirmRow],
    ephemeral: true,
  });

  // Wait for button click (30 second timeout)
  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30_000,
    });

    if (buttonInteraction.customId === 'clear_confirm') {
      sessionManager.clearSession(threadId);
      await buttonInteraction.update({
        content: '**Session cleared.** Claude will start fresh on your next message.',
        components: [],
      });
    } else {
      await buttonInteraction.update({
        content: '*Cancelled.* Session was not cleared.',
        components: [],
      });
    }
  } catch {
    // Timeout - remove buttons
    await interaction.editReply({
      content: '*Timed out.* Session was not cleared.',
      components: [],
    });
  }
}
