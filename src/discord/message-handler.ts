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
  private processedMessages: Map<string, number> = new Map(); // messageKey -> timestamp
  private readonly MESSAGE_DEDUP_WINDOW_MS = 30000; // 30 second window to prevent duplicates

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

    // Prevent duplicate processing with time-based deduplication
    //
    // Why message.id alone is sufficient:
    // - Discord Snowflake IDs are globally unique across all of Discord
    // - The same message has one ID regardless of where it's accessed
    //   (even when a message becomes a thread starter, its ID stays the same)
    // - Previously we used `${channelId}-${messageId}` but this caused duplicates
    //   because the same message fires events with different channelIds
    //
    // Why 30 second window:
    // - Handles race conditions during thread creation
    // - Network issues and retries are handled by Discord.js internally
    // - User re-sending creates a new message with new ID (not a duplicate)
    const messageKey = message.id;
    const now = Date.now();

    // Clean up old entries periodically
    if (this.processedMessages.size > 100) {
      for (const [key, timestamp] of this.processedMessages) {
        if (now - timestamp > this.MESSAGE_DEDUP_WINDOW_MS) {
          this.processedMessages.delete(key);
        }
      }
    }

    // Check if we've recently processed this message
    const lastProcessed = this.processedMessages.get(messageKey);
    if (lastProcessed && now - lastProcessed < this.MESSAGE_DEDUP_WINDOW_MS) {
      console.log(`[MessageHandler] Skipping duplicate message ${message.id} (processed ${now - lastProcessed}ms ago)`);
      return;
    }

    // Mark as processing immediately to prevent race conditions
    this.processedMessages.set(messageKey, now);

    try {
      await this.processMessage(message, parsed, directory, isThread);
    } catch (error) {
      console.error(`[MessageHandler] Error processing message:`, error);
      throw error;
    }
    // Note: We keep the message in processedMessages for the dedup window
    // to prevent duplicate processing from race conditions
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

    // Determine session ID to resume
    // Note: Empty string '' is falsy in JavaScript, so `|| undefined` converts
    // both '' and null/undefined to undefined, signaling a new session to the SDK.
    // The SDK's `resume` option expects undefined (or omitted) for new sessions.
    const resumeSessionId = session.sessionId || undefined;

    console.log(`[MessageHandler] Processing message in thread ${threadId}`);
    console.log(`[MessageHandler] isNewSession: ${isNewSession}, resumeSessionId: ${resumeSessionId || '(new session)'}`);

    try {
      // Execute query with streaming
      const queryGenerator = executeQuery({
        prompt,
        cwd: directory,
        sessionId: resumeSessionId,
        agentConfig: parsed.agentConfig,
        modelOverride: session.modelOverride ?? undefined,
      });

      // Render the stream to Discord
      const newSessionId = await renderer.render(queryGenerator);

      console.log(`[MessageHandler] Query complete, newSessionId: ${newSessionId || '(none)'}`);

      // Update session with actual session ID
      if (newSessionId && newSessionId !== session.sessionId) {
        console.log(`[MessageHandler] Updating session with new ID: ${newSessionId}`);
        sessionManager.updateSessionActivity(threadId, newSessionId);
      } else {
        console.log(`[MessageHandler] Updating session activity (no ID change)`);
        sessionManager.updateSessionActivity(threadId);
      }
    } catch (error) {
      console.error(`[MessageHandler] Error during query execution:`, error);
      // Still update activity even on error
      sessionManager.updateSessionActivity(threadId);
      throw error;
    }
  }

  /**
   * Create a new thread for a conversation, or get existing one if already created
   */
  private async createThread(message: Message, alias: string): Promise<ThreadChannel> {
    // Check if a thread already exists for this message
    if (message.thread) {
      console.log(`[MessageHandler] Thread already exists for message, using existing thread ${message.thread.id}`);
      return message.thread;
    }

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

    try {
      // Create the thread
      const thread = await (message.channel as TextChannel).threads.create({
        name: threadName,
        autoArchiveDuration: this.options.threadArchiveDuration,
        startMessage: message,
        reason: `Claude Code session started by ${message.author.tag}`,
      });

      return thread;
    } catch (error: any) {
      // Handle "thread already exists" error (code 160004)
      if (error.code === 160004) {
        console.log(`[MessageHandler] Thread creation race condition, fetching existing thread`);
        // Fetch the message again to get the thread reference
        const freshMessage = await message.fetch();
        if (freshMessage.thread) {
          return freshMessage.thread;
        }
      }
      throw error;
    }
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
