# Discord-Claude Bridge Setup Guide

Follow these steps to get the Discord-Claude Bridge running.

---

## 1. Create Discord Bot

### Step 1: Create Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
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

### Step 4: Generate Invite Link
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

---

## 2. Configure Environment

```bash
cd ~/workbench/discord-claude-bridge
cp .env.example .env
```

Then edit `.env` with your values:
```
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

---

## 3. Configure Channel Mappings

Edit `src/config/channels.json` to map Discord channels to directories:

```json
{
  "mappings": [
    {
      "channelId": "YOUR_CHANNEL_ID",
      "directory": "/Users/maxmelander",
      "description": "Home channel"
    },
    {
      "channelId": "ANOTHER_CHANNEL_ID",
      "directory": "/Users/maxmelander/projects/some-project",
      "description": "Project X"
    }
  ],
  "defaultDirectory": "/Users/maxmelander"
}
```

**To get a Channel ID:**
1. In Discord, go to **User Settings** → **Advanced** → Enable **"Developer Mode"**
2. Right-click any channel → **"Copy Channel ID"**

---

## 4. Run the Bot

```bash
# Development mode (with hot reload)
npm run dev

# Or production build
npm run build && npm start
```

---

## 5. Test It!

In your Discord server, send a message in a mapped channel:

```
@claude help me list the files in this directory
```

The bot will:
1. Create a thread for the conversation
2. Show tool calls as they happen (streaming with 1.5s debounce)
3. Display the response with truncated outputs
4. Session persists - continue chatting in the thread!

### Agent Aliases

You can use different aliases to switch models/prompts:

| Alias | Model | Description |
|-------|-------|-------------|
| `@claude` | Sonnet 4 | Default agent |
| `@opus` | Opus 4 | Complex architecture tasks |
| `@review` | Sonnet 4 | Code review focused |
| `@haiku` | Haiku 3.5 | Quick, simple tasks |

**Examples:**
```
@claude fix this bug in the login form
@opus design a scalable architecture for this service
@review check this function for security issues
@haiku what's the syntax for a for loop in Python?
```

---

## Troubleshooting

### Bot not responding?
- Check that **MESSAGE CONTENT INTENT** is enabled in Discord Developer Portal
- Verify the bot has permissions in the channel
- Check logs for errors: `npm run dev`

### Channel not mapped?
- Ensure you added the channel ID to `src/config/channels.json`
- The bot uses `defaultDirectory` for unmapped channels

### Session not persisting?
- Sessions are stored in `data/sessions.db`
- Check that the `data/` directory is writable
