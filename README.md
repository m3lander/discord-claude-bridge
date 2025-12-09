# Discord-Claude Bridge

A bridge that connects Discord to Claude Code via the Anthropic Agent SDK, enabling you to interact with Claude Code through Discord messages.

## Features

- **Channel → Directory Mapping**: Each Discord channel maps to a specific directory on your filesystem
- **Thread-Based Sessions**: Each Discord thread maintains a persistent Claude Code session
- **Streaming Responses**: See tool calls, diffs, and responses in real-time
- **Project Context**: Automatically loads `CLAUDE.md`, custom commands, and skills from mapped directories
- **Multi-Agent Support** (planned): Different bot personalities with different models/prompts

## Prerequisites

- Node.js 20+
- npm or yarn
- An Anthropic API key
- A Discord account with a server you manage

---

## Discord Bot Setup

### Step 1: Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** (top right)
3. Name it something like "Claude Code Bridge"
4. Click **Create**

### Step 2: Configure the Bot

1. In your application, go to the **"Bot"** section (left sidebar)
2. Click **"Add Bot"** → **"Yes, do it!"**
3. Under the bot's username, click **"Reset Token"** and copy the token
   - ⚠️ **Save this token securely** - you won't be able to see it again!
   - This goes in your `.env` file as `DISCORD_BOT_TOKEN`

4. Scroll down to **"Privileged Gateway Intents"** and enable:
   - ✅ **MESSAGE CONTENT INTENT** (required to read message content)
   - ✅ **SERVER MEMBERS INTENT** (optional, for member info)

5. Click **"Save Changes"**

### Step 3: Get Your Client ID

1. Go to the **"OAuth2"** section (left sidebar)
2. Copy the **"Client ID"**
   - This goes in your `.env` file as `DISCORD_CLIENT_ID`

### Step 4: Generate an Invite Link

1. In **"OAuth2"** → **"URL Generator"**
2. Under **"Scopes"**, select:
   - ✅ `bot`
   - ✅ `applications.commands`

3. Under **"Bot Permissions"**, select:
   - ✅ Send Messages
   - ✅ Send Messages in Threads
   - ✅ Create Public Threads
   - ✅ Create Private Threads
   - ✅ Manage Threads
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Add Reactions
   - ✅ Use Slash Commands

4. Copy the generated URL at the bottom
5. Open the URL in your browser and add the bot to your server

### Step 5: Get Channel IDs

To map channels to directories, you need Discord channel IDs:

1. In Discord, go to **User Settings** → **Advanced** → Enable **"Developer Mode"**
2. Right-click any channel → **"Copy Channel ID"**

---

## Installation

```bash
# Clone or navigate to the project
cd ~/workbench/discord-claude-bridge

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your tokens
nano .env  # or use your preferred editor
```

## Configuration

### Channel Mappings (`src/config/channels.json`)

Map Discord channels to filesystem directories:

```json
{
  "mappings": [
    {
      "channelId": "YOUR_CHANNEL_ID",
      "directory": "/Users/maxmelander",
      "description": "Home directory for general tasks"
    },
    {
      "channelId": "ANOTHER_CHANNEL_ID",
      "directory": "/Users/maxmelander/projects/my-webapp",
      "description": "Web application project"
    }
  ],
  "defaultDirectory": "/Users/maxmelander"
}
```

### Agent Configuration (`src/config/agents.json`)

Configure bot aliases and their settings:

```json
{
  "aliases": {
    "claude": {
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": null,
      "description": "Default Claude Code agent"
    },
    "opus": {
      "model": "claude-opus-4-20250514",
      "systemPrompt": "You are a senior software architect...",
      "description": "Opus model for complex tasks"
    },
    "review": {
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": "You are a code reviewer. Focus on bugs, security, and best practices.",
      "description": "Code review specialist"
    }
  },
  "defaultAlias": "claude",
  "triggerPrefix": "@"
}
```

**Usage in Discord:**
- `@claude help me fix this bug` → Uses default Sonnet
- `@opus design the architecture for...` → Uses Opus model
- `@review check this PR` → Uses review-focused prompt

---

## Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

---

## Usage

### Basic Interaction

1. Go to a mapped channel in your Discord server
2. Send a message mentioning the bot or using an alias:
   ```
   @Claude help me create a new React component
   ```
3. The bot will:
   - Create a thread for the conversation
   - Stream responses with tool calls visible
   - Maintain session state for follow-up messages

### Thread Sessions

- Each thread = one persistent Claude Code session
- Continue conversations naturally within threads
- Session inherits the channel's directory mapping

### Slash Commands

Claude Code's slash commands work in Discord:
- `/compact` - Compress conversation context
- `/exit` - End the current session
- `/clear` - Clear and start fresh

---

## Architecture

```
Discord Message
       │
       ▼
┌─────────────────┐
│ Message Handler │ ──► Detect alias, get agent config
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Channel Router  │ ──► Map channel → directory
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Session Manager │ ──► Get/create session for thread
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Query Executor  │ ──► Call Agent SDK with options
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Stream Renderer │ ──► Buffer + debounce → Discord edits
└─────────────────┘
```

---

## Troubleshooting

### Bot not responding?
- Check that MESSAGE CONTENT INTENT is enabled in Discord Developer Portal
- Verify the bot has permissions in the channel
- Check logs for errors

### Rate limited?
- The stream renderer debounces edits to stay under Discord's limits
- If you still hit limits, increase `EDIT_DEBOUNCE_MS` in config

### Session not persisting?
- Sessions are stored in `data/sessions.db`
- Check that the data directory is writable

---

## License

MIT
