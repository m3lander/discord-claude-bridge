/**
 * Message Handler - Processes incoming Discord messages
 *
 * Routes messages to the appropriate Claude Code session based on:
 * - Agent alias (parsed from message content)
 * - Channel mapping (determines working directory)
 * - Thread context (determines session to resume)
 */

import {
  Client,
  Events,
  Message,
  TextChannel,
  ThreadChannel,
  ChannelType,
  GatewayIntentBits,
} from 'discord.js';
import { getSessionManager } from '../core/session-manager.js';
import { getChannelRouter } from '../core/channel-router.js';
import { getAgentRegistry, type ParsedMessage } from '../core/agent-registry.js';
import { executeQuery, extractSessionId } from '../core/query-executor.js';
import { createStreamRenderer } from './stream-renderer.js';

export interface MessageHandlerOptions {
  /** Respond only when mentioned or triggered with alias */
  requireTrigger?: boolean;
  /** Auto-create threads for new conversations */
  autoCreateThreads?: boolean;
  /** Thread auto-archive duration in minutes (60, 1440, 4320, 10080) */
  threadArchiveDuration?: 60 | 1440 | 4320 | 10080;
}

export class MessageHandler {
  private client: Client;
  private options: MessageHandlerOptions;
  private activeQueries: Set<string> = new Set(); // Prevent duplicate processing

  constructor(client: Client, options: MessageHandlerOptions = {}) {
    this.client = client;
    this.options = {
      requireTrigger: options.requireTrigger ?? true,
      autoCreateThreads: options.autoCreateThreads ?? true,
      threadArchiveDuration: options.threadArchiveDuration ?? 1440, // 24 hours
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });
  }

  /**
   * Handle an incoming Discord message
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Ignore DMs for now
    if (!message.guild) return;

    // Ignore empty messages
    if (!message.content.trim()) return;

    // Check if message is in a thread or channel
    const isThread = message.channel.type === ChannelType.PublicThread ||
                     message.channel.type === ChannelType.PrivateThread;

    // Get the base channel (parent channel if in thread)
    const baseChannel = isThread
      ? (message.channel as ThreadChannel).parent as TextChannel
      : message.channel as TextChannel;

    if (!baseChannel) return;

    // Check if this channel is mapped
    const channelRouter = getChannelRouter();
    const directory = channelRouter.getDirectory(baseChannel.id);

    // Parse the message for agent alias
    const agentRegistry = getAgentRegistry();
    const parsed = agentRegistry.parseMessage(message.content);

    // If require trigger is enabled, check if message has a trigger
    if (this.options.requireTrigger) {
      const hasTrigger = agentRegistry.hasTrigger(message.content) ||
                         message.mentions.has(this.client.user!);

      // In threads, always respond (thread = active session)
      if (!hasTrigger && !isThread) {
        return; // Ignore message without trigger in channels
      }
    }

    // Prevent duplicate processing
    const messageKey = `${message.channelId}-${message.id}`;
    if (this.activeQueries.has(messageKey)) return;
    this.activeQueries.add(messageKey);

    try {
      await this.processMessage(message, parsed, directory, isThread);
    } finally {
      this.activeQueries.delete(messageKey);
    }
  }

  /**
   * Process a message and execute the Claude Code query
   */
  private async processMessage(
    message: Message,
    parsed: ParsedMessage,
    directory: string,
    isInThread: boolean
  ): Promise<void> {
    const sessionManager = getSessionManager();

    let targetChannel: TextChannel | ThreadChannel;
    let threadId: string;

    if (isInThread) {
      // Already in a thread - use it directly
      targetChannel = message.channel as ThreadChannel;
      threadId = message.channel.id;
    } else if (this.options.autoCreateThreads) {
      // Create a new thread for this conversation
      const thread = await this.createThread(message, parsed.alias);
      targetChannel = thread;
      threadId = thread.id;
    } else {
      // Respond in channel (not recommended for long conversations)
      targetChannel = message.channel as TextChannel;
      threadId = `${message.channelId}-${message.id}`; // Pseudo-thread ID
    }

    // Get or create session
    let session = sessionManager.getSession(threadId);
    const isNewSession = !session;

    if (!session) {
      // Create placeholder - we'll get the real session ID from the SDK
      session = sessionManager.createSession({
        threadId,
        sessionId: '', // Will be updated after query
        channelId: (targetChannel as any).parentId || targetChannel.id,
        directory,
        agentAlias: parsed.alias,
      });
    }

    // Clean the prompt (remove the alias prefix if present)
    const prompt = parsed.content || message.content;

    if (!prompt.trim()) {
      await targetChannel.send('Please provide a message for Claude.');
      return;
    }

    // Create stream renderer
    const renderer = createStreamRenderer(targetChannel);

    // Execute query with streaming
    const queryGenerator = executeQuery({
      prompt,
      cwd: directory,
      sessionId: isNewSession ? undefined : session.sessionId,
      agentConfig: parsed.agentConfig,
    });

    // Render the stream to Discord
    const newSessionId = await renderer.render(queryGenerator);

    // Update session with actual session ID
    if (newSessionId && newSessionId !== session.sessionId) {
      sessionManager.updateSessionActivity(threadId, newSessionId);
    } else {
      sessionManager.updateSessionActivity(threadId);
    }
  }

  /**
   * Create a new thread for a conversation
   */
  private async createThread(message: Message, alias: string): Promise<ThreadChannel> {
    // Generate thread name from message content
    const maxNameLength = 100;
    let threadName = message.content.slice(0, maxNameLength);

    // Clean up thread name
    threadName = threadName
      .replace(new RegExp(`^@${alias}\\s*`, 'i'), '') // Remove alias
      .replace(/<@!?\d+>/g, '') // Remove user mentions
      .replace(/<#\d+>/g, '') // Remove channel mentions
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Fallback name if cleaned content is too short
    if (threadName.length < 5) {
      threadName = `${alias} - ${new Date().toLocaleString()}`;
    }

    // Truncate if still too long
    if (threadName.length > maxNameLength) {
      threadName = threadName.slice(0, maxNameLength - 3) + '...';
    }

    // Create the thread
    const thread = await (message.channel as TextChannel).threads.create({
      name: threadName,
      autoArchiveDuration: this.options.threadArchiveDuration,
      startMessage: message,
      reason: `Claude Code session started by ${message.author.tag}`,
    });

    return thread;
  }
}

/**
 * Create and configure the Discord client with message handling
 */
export function createDiscordClient(options?: MessageHandlerOptions): {
  client: Client;
  handler: MessageHandler;
} {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
  });

  const handler = new MessageHandler(client, options);

  return { client, handler };
}
