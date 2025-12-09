/**
 * Query Executor - Wraps the Claude Agent SDK query() function
 *
 * Configures the SDK with the appropriate options based on:
 * - Channel → Directory mapping (cwd)
 * - Thread → Session mapping (resume)
 * - Agent alias → Model/prompt configuration
 */

import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig } from './agent-registry.js';

export interface QueryOptions {
  prompt: string;
  cwd: string;
  sessionId?: string;
  agentConfig: AgentConfig;
  abortController?: AbortController;
}

export interface QueryResult {
  sessionId: string;
  messages: SDKMessage[];
  result?: string;
  error?: string;
}

/**
 * Execute a query against Claude Code via the Agent SDK
 * Returns an async generator for streaming responses
 */
export async function* executeQuery(options: QueryOptions): AsyncGenerator<SDKMessage, void, unknown> {
  const {
    prompt,
    cwd,
    sessionId,
    agentConfig,
    abortController = new AbortController(),
  } = options;

  // Build SDK options
  const sdkOptions: Options = {
    cwd,
    model: agentConfig.model,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,

    // Load project settings (CLAUDE.md, etc.) from the mapped directory
    settingSources: ['project'],

    // Use Claude Code's default system prompt, optionally appending custom instructions
    systemPrompt: agentConfig.systemPrompt
      ? {
          type: 'preset',
          preset: 'claude_code',
          append: agentConfig.systemPrompt,
        }
      : {
          type: 'preset',
          preset: 'claude_code',
        },

    // Use Claude Code's default tools
    tools: { type: 'preset', preset: 'claude_code' },

    // Resume existing session if provided
    ...(sessionId && { resume: sessionId }),

    // Include partial messages for streaming
    includePartialMessages: true,

    // Abort controller for cancellation
    abortController,
  };

  // Execute the query and yield messages
  const response = query({
    prompt,
    options: sdkOptions,
  });

  for await (const message of response) {
    yield message;
  }
}

/**
 * Execute a query and collect all messages into a result object
 * Useful for non-streaming use cases
 */
export async function executeQuerySync(options: QueryOptions): Promise<QueryResult> {
  const messages: SDKMessage[] = [];
  let sessionId = '';
  let result: string | undefined;
  let error: string | undefined;

  try {
    for await (const message of executeQuery(options)) {
      messages.push(message);

      // Capture session ID from init message
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
      }

      // Capture result
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          result = message.result;
        } else {
          error = message.errors?.join('\n') || 'Unknown error';
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    sessionId,
    messages,
    result,
    error,
  };
}

/**
 * Extract session ID from a stream of messages
 * Useful when you need the session ID early in the stream
 */
export function extractSessionId(message: SDKMessage): string | null {
  if (message.type === 'system' && message.subtype === 'init') {
    return message.session_id;
  }
  return null;
}

/**
 * Check if a message indicates the query is complete
 */
export function isResultMessage(message: SDKMessage): boolean {
  return message.type === 'result';
}

/**
 * Check if a message is an assistant response (not partial)
 */
export function isAssistantMessage(message: SDKMessage): boolean {
  return message.type === 'assistant';
}

/**
 * Check if a message is a streaming partial
 */
export function isPartialMessage(message: SDKMessage): boolean {
  return message.type === 'stream_event';
}
