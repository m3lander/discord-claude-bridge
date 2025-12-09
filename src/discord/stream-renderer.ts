/**
 * Stream Renderer - Renders SDK message stream to Discord with debounced updates
 *
 * Implements buffered output strategy to respect Discord rate limits:
 * - Collects partial chunks from SDK
 * - Flushes to Discord every DEBOUNCE_MS (1.5-2 seconds)
 * - Immediately flushes on critical events (tool start/complete, result)
 *
 * Discord rate limit: ~5 edits per 5 seconds per message
 * Our strategy: max 1 edit per 1.5 seconds = safe margin
 */

import type { Message, TextChannel, ThreadChannel } from 'discord.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { formatToolCall, formatToolCallCompact } from '../formatters/tool-call.js';
import { formatDiff, formatWrite } from '../formatters/diff.js';
import { formatCodeBlock } from '../formatters/code-block.js';

// Configuration
const DEBOUNCE_MS = 1500; // Flush buffer every 1.5 seconds
const MAX_MESSAGE_LENGTH = 1900; // Discord limit is 2000, leave margin
const MAX_TOOL_HISTORY = 5; // Keep last N tool calls visible

export interface StreamRendererOptions {
  debounceMs?: number;
  maxMessageLength?: number;
  showToolCalls?: boolean;
  showPartialText?: boolean;
}

interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'complete' | 'error';
  output?: unknown;
  timestamp: number;
}

export class StreamRenderer {
  private discordMessage: Message | null = null;
  private channel: TextChannel | ThreadChannel;

  // Buffer state
  private buffer: string = '';
  private toolCalls: ToolCallRecord[] = [];
  private currentText: string = '';
  private isComplete: boolean = false;
  private hasError: boolean = false;
  private errorMessage: string = '';

  // Debounce state
  private flushTimeout: NodeJS.Timeout | null = null;
  private lastFlushTime: number = 0;
  private pendingFlush: boolean = false;

  // Options
  private debounceMs: number;
  private maxMessageLength: number;
  private showToolCalls: boolean;
  private showPartialText: boolean;

  constructor(channel: TextChannel | ThreadChannel, options: StreamRendererOptions = {}) {
    this.channel = channel;
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.maxMessageLength = options.maxMessageLength ?? MAX_MESSAGE_LENGTH;
    this.showToolCalls = options.showToolCalls ?? true;
    this.showPartialText = options.showPartialText ?? true;
  }

  /**
   * Process a stream of SDK messages and render to Discord
   */
  async render(messageStream: AsyncIterable<SDKMessage>): Promise<string | null> {
    let sessionId: string | null = null;

    try {
      // Send initial "thinking" message
      this.discordMessage = await this.channel.send('🤔 *Thinking...*');

      for await (const message of messageStream) {
        // Capture session ID
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id;
        }

        // Process the message
        await this.processMessage(message);
      }

      // Final flush
      await this.flushNow();

    } catch (error) {
      this.hasError = true;
      this.errorMessage = error instanceof Error ? error.message : String(error);
      await this.flushNow();
    } finally {
      this.cleanup();
    }

    return sessionId;
  }

  /**
   * Process a single SDK message
   */
  private async processMessage(message: SDKMessage): Promise<void> {
    switch (message.type) {
      case 'system':
        // Init message - nothing to render
        break;

      case 'assistant':
        // Full assistant message - extract text content
        await this.handleAssistantMessage(message);
        break;

      case 'stream_event':
        // Partial streaming event
        if (this.showPartialText) {
          await this.handleStreamEvent(message);
        }
        break;

      case 'result':
        // Query complete
        this.isComplete = true;
        if (message.subtype !== 'success') {
          this.hasError = true;
          this.errorMessage = (message as any).errors?.join('\n') || 'Query failed';
        }
        await this.flushNow(); // Immediate flush on completion
        break;
    }
  }

  /**
   * Handle a full assistant message (contains tool uses and text)
   */
  private async handleAssistantMessage(message: SDKMessage): Promise<void> {
    if (message.type !== 'assistant') return;

    const content = message.message.content;
    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (block.type === 'text') {
        this.currentText = block.text;
        this.scheduleFlush();
      } else if (block.type === 'tool_use') {
        // Tool call started
        await this.handleToolStart(block.name, block.input as Record<string, unknown>);
      } else if (block.type === 'tool_result') {
        // Tool call completed
        await this.handleToolComplete(block.tool_use_id, block.content);
      }
    }
  }

  /**
   * Handle streaming partial events
   */
  private async handleStreamEvent(message: SDKMessage): Promise<void> {
    if (message.type !== 'stream_event') return;

    const event = message.event;

    // Handle different event types
    if (event.type === 'content_block_delta') {
      const delta = event.delta;

      if (delta.type === 'text_delta' && delta.text) {
        this.currentText += delta.text;
        this.scheduleFlush();
      } else if (delta.type === 'input_json_delta') {
        // Tool input streaming - could update tool call display
        this.scheduleFlush();
      }
    } else if (event.type === 'content_block_start') {
      const block = event.content_block;

      if (block.type === 'tool_use') {
        // Tool starting
        await this.handleToolStart(block.name, block.input as Record<string, unknown>);
      }
    } else if (event.type === 'content_block_stop') {
      // Block complete - flush
      this.scheduleFlush();
    }
  }

  /**
   * Handle tool call start - immediate flush
   */
  private async handleToolStart(name: string, input: Record<string, unknown>): Promise<void> {
    // Add to tool calls
    this.toolCalls.push({
      name,
      input,
      status: 'running',
      timestamp: Date.now(),
    });

    // Keep only recent tool calls
    if (this.toolCalls.length > MAX_TOOL_HISTORY) {
      this.toolCalls = this.toolCalls.slice(-MAX_TOOL_HISTORY);
    }

    // Immediate flush on tool start
    await this.flushNow();
  }

  /**
   * Handle tool call completion - immediate flush
   */
  private async handleToolComplete(toolUseId: string, output: unknown): Promise<void> {
    // Find and update the tool call
    // Note: We don't have tool_use_id in our simple tracking, so update the last running one
    const runningTool = [...this.toolCalls].reverse().find(t => t.status === 'running');
    if (runningTool) {
      runningTool.status = 'complete';
      runningTool.output = output;
    }

    // Immediate flush on tool complete
    await this.flushNow();
  }

  /**
   * Schedule a debounced flush
   */
  private scheduleFlush(): void {
    this.pendingFlush = true;

    // If we already have a timeout, let it handle the flush
    if (this.flushTimeout) return;

    // Calculate time since last flush
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    const delay = Math.max(0, this.debounceMs - timeSinceLastFlush);

    this.flushTimeout = setTimeout(async () => {
      this.flushTimeout = null;
      if (this.pendingFlush) {
        await this.flushNow();
      }
    }, delay);
  }

  /**
   * Immediately flush buffer to Discord
   */
  private async flushNow(): Promise<void> {
    this.pendingFlush = false;
    this.lastFlushTime = Date.now();

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    const content = this.buildMessageContent();

    if (!this.discordMessage) {
      this.discordMessage = await this.channel.send(content);
    } else {
      try {
        await this.discordMessage.edit(content);
      } catch (error) {
        // Message might be deleted, try to send new one
        console.error('Failed to edit message:', error);
        try {
          this.discordMessage = await this.channel.send(content);
        } catch (sendError) {
          console.error('Failed to send new message:', sendError);
        }
      }
    }
  }

  /**
   * Build the full message content for Discord
   */
  private buildMessageContent(): string {
    const parts: string[] = [];

    // Tool calls section
    if (this.showToolCalls && this.toolCalls.length > 0) {
      const toolSection = this.buildToolSection();
      if (toolSection) parts.push(toolSection);
    }

    // Separator
    if (parts.length > 0 && this.currentText) {
      parts.push('───────────────────────');
    }

    // Current text
    if (this.currentText) {
      parts.push(this.truncateText(this.currentText));
    } else if (!this.isComplete && this.toolCalls.length === 0) {
      parts.push('🤔 *Thinking...*');
    }

    // Status indicator
    if (!this.isComplete) {
      const runningTool = this.toolCalls.find(t => t.status === 'running');
      if (runningTool) {
        parts.push(`\n⏳ *Running ${runningTool.name}...*`);
      }
    }

    // Error message
    if (this.hasError) {
      parts.push(`\n❌ **Error:** ${this.truncateText(this.errorMessage, 200)}`);
    }

    // Completion indicator
    if (this.isComplete && !this.hasError) {
      parts.push('\n✅ *Complete*');
    }

    let content = parts.join('\n\n');

    // Ensure we don't exceed Discord's limit
    if (content.length > this.maxMessageLength) {
      content = content.slice(0, this.maxMessageLength - 50) + '\n\n... *[truncated]*';
    }

    return content || '🤔 *Processing...*';
  }

  /**
   * Build the tool calls section
   */
  private buildToolSection(): string {
    const lines: string[] = [];

    for (const tool of this.toolCalls) {
      const emoji = tool.status === 'running' ? '⏳' :
                    tool.status === 'error' ? '❌' : '✅';

      // Format based on tool type
      if (tool.name === 'Edit' && tool.status === 'complete') {
        // Show diff for edits
        const diff = formatDiff({
          filePath: tool.input.file_path as string,
          oldString: tool.input.old_string as string,
          newString: tool.input.new_string as string,
          replaceAll: tool.input.replace_all as boolean,
        });
        lines.push(diff);
      } else if (tool.name === 'Write' && tool.status === 'complete') {
        // Show write preview
        lines.push(formatWrite(
          tool.input.file_path as string,
          (tool.output as any)?.content || '[content]'
        ));
      } else {
        // Compact format for other tools
        lines.push(`${emoji} ${formatToolCallCompact(tool.name, tool.input)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Truncate text to fit Discord limits
   */
  private truncateText(text: string, maxLength: number = this.maxMessageLength / 2): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 20) + '\n\n... *[truncated]*';
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }
}

/**
 * Create a stream renderer for a channel/thread
 */
export function createStreamRenderer(
  channel: TextChannel | ThreadChannel,
  options?: StreamRendererOptions
): StreamRenderer {
  return new StreamRenderer(channel, options);
}
