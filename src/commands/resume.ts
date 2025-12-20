/**
 * /resume Command Handler
 *
 * Shows recent sessions and allows the user to select one to resume.
 * Uses a select menu with thread names and session metadata.
 */

import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ChannelType,
  Client,
} from 'discord.js';
import { getSessionManager, type Session } from '../core/session-manager.js';

/**
 * Helper to fetch thread name from Discord
 */
async function getThreadName(client: Client, threadId: string): Promise<string> {
  try {
    const channel = await client.channels.fetch(threadId);
    if (channel && 'name' in channel && channel.name) {
      return channel.name;
    }
  } catch {
    // Thread may be archived or deleted
  }
  return 'Unknown Thread';
}

/**
 * Format relative time from a date
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export async function handleResumeCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? 10;
  const sessionManager = getSessionManager();

  // Get current channel ID for filtering
  // If in a thread, use the parent channel; otherwise use current channel
  const channelId = interaction.channel?.type === ChannelType.PublicThread ||
                    interaction.channel?.type === ChannelType.PrivateThread
    ? ((interaction.channel as any).parentId ?? interaction.channelId)
    : interaction.channelId;

  // Get recent sessions for this channel
  const allSessions = sessionManager.getChannelSessions(channelId);
  const sessions = allSessions.slice(0, limit);

  if (sessions.length === 0) {
    await interaction.reply({
      content: 'No recent sessions found in this channel.',
      ephemeral: true,
    });
    return;
  }

  // Defer reply while we fetch thread names
  await interaction.deferReply({ ephemeral: true });

  // Build select menu options with thread names
  const options: StringSelectMenuOptionBuilder[] = [];

  for (const session of sessions) {
    const threadName = await getThreadName(interaction.client, session.threadId);
    const timeAgo = formatRelativeTime(session.lastActiveAt);
    const modelInfo = session.modelOverride || session.agentAlias;

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(threadName.slice(0, 100)) // Discord limit
        .setDescription(`${session.messageCount} msgs | ${modelInfo} | ${timeAgo}`)
        .setValue(session.threadId)
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('resume_session')
    .setPlaceholder('Select a session to resume')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const response = await interaction.editReply({
    content: `**Resume a session** (${sessions.length} found)\n\nSelect a thread to jump to:`,
    components: [row],
  });

  // Wait for selection (60 second timeout)
  try {
    const selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    const selectedThreadId = selectInteraction.values[0];

    // Create link to the thread
    const threadUrl = `https://discord.com/channels/${interaction.guildId}/${selectedThreadId}`;

    await selectInteraction.update({
      content: `**Resuming session**\n\nJump to thread: ${threadUrl}\n\nSend a message there to continue the conversation.`,
      components: [],
    });
  } catch {
    // Timeout
    await interaction.editReply({
      content: '*Timed out.* Use `/resume` again to select a session.',
      components: [],
    });
  }
}
