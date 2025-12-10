# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev          # Development with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled code
npm run typecheck    # Type check without emitting
```

## Architecture

Discord-Claude Bridge connects Discord to Claude Code via the Anthropic Agent SDK. The flow is:

```
Discord Message → MessageHandler → ChannelRouter → SessionManager → QueryExecutor → StreamRenderer → Discord
```

### Core Components (`src/core/`)

- **session-manager.ts**: SQLite-backed persistence of thread→session mappings. Each Discord thread maintains a Claude Code session that can be resumed across messages.
- **channel-router.ts**: Maps Discord channel IDs to filesystem directories. Sessions in a channel inherit that directory's working context (CLAUDE.md, skills, etc).
- **agent-registry.ts**: Handles agent aliases (`@claude`, `@opus`, `@review`, `@haiku`). Parses message prefixes and returns appropriate model/prompt config.
- **query-executor.ts**: Wraps the Agent SDK `query()` function. Configures options from session context and yields streaming messages.

### Discord Components (`src/discord/`)

- **message-handler.ts**: Entry point for Discord events. Detects triggers, routes to appropriate sessions, creates threads for new conversations.
- **stream-renderer.ts**: Buffers SDK stream events and debounces Discord message edits (1.5s interval) to respect rate limits. Handles tool call display and partial text updates.

### Formatters (`src/formatters/`)

Utilities for rendering SDK output to Discord-friendly markdown:
- `tool-call.ts`: Tool name, inputs, compact summaries
- `diff.ts`: Edit operations as diff blocks
- `code-block.ts`: Syntax highlighting, truncation

## Configuration

- `src/config/channels.json`: Channel ID → directory mappings
- `src/config/agents.json`: Agent aliases with model/prompt overrides
- `.env`: `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`

## Key Design Decisions

- **Thread-based sessions**: New conversations create Discord threads. The thread ID is the session key, enabling resumable multi-turn conversations.
- **Bypass permissions**: Uses `permissionMode: 'bypassPermissions'` - the bot runs with full filesystem access. This is intentional for the use case.
- **Debounced streaming**: Discord rate limits edits to ~5/5sec per message. StreamRenderer buffers updates and flushes every 1.5 seconds.
- **Singleton pattern**: Core components use module-level singletons (`getSessionManager()`, `getChannelRouter()`, `getAgentRegistry()`).

## Claude Agent SDK Usage

This project uses `@anthropic-ai/claude-agent-sdk` to interact with Claude Code. Key SDK concepts used:

### SDK Query Function

The `query()` function from the SDK is the core integration point (`src/core/query-executor.ts`):

```typescript
import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: "user message",
  options: {
    cwd: "/path/to/project",           // Working directory
    model: "claude-sonnet-4-20250514", // Model selection
    permissionMode: 'bypassPermissions',
    settingSources: ['project'],       // Load CLAUDE.md from cwd
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: "optional custom instructions"
    },
    tools: { type: 'preset', preset: 'claude_code' },
    resume: sessionId,                 // Resume existing session
    includePartialMessages: true,      // Enable streaming
  }
});

for await (const message of response) {
  // Handle SDKMessage stream
}
```

### SDK Message Types

The SDK yields `SDKMessage` objects. Key types handled in `stream-renderer.ts`:

- `system` (subtype `init`): Contains `session_id` for session resumption
- `assistant`: Full assistant messages with `content` blocks (text, tool_use, tool_result)
- `stream_event`: Partial streaming events (content_block_delta, content_block_start, etc.)
- `result`: Query completion (subtype `success` or error with `errors` array)

### Session Resumption

Sessions are resumed by passing the previous `session_id` to the `resume` option. The session ID is captured from the `system.init` message and stored in SQLite for thread persistence.

### SDK Documentation

- Overview: https://docs.claude.com/en/api/agent-sdk/overview
- TypeScript Reference: https://docs.claude.com/en/api/agent-sdk/typescript

## TypeScript

ESM modules with `.js` extensions in imports (required for NodeNext resolution). Strict mode enabled. Package has `"type": "module"` in package.json.
