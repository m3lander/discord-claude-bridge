# Discord Slash Commands Implementation Plan

Add `/model`, `/clear`, and `/resume` slash commands to discord-claude-bridge.

## Summary

- **Commands**: `/model` (change model for thread), `/clear` (reset session), `/resume` (pick from recent sessions via select menu)
- **Registration**: Guild-specific for instant updates
- **UX**: `/model` persists for thread, `/resume` uses rich StringSelectMenu with thread names

## Files to Create

### 1. `src/config/guilds.json`
```json
{
  "guildIds": ["YOUR_GUILD_ID"],
  "registerGlobally": false
}
```

### 2. `src/commands/definitions.ts`
SlashCommandBuilder definitions for all three commands:
- `/model` - String option with choices: sonnet, opus, haiku
- `/clear` - No options
- `/resume` - Optional integer `limit` (1-25, default 10)

### 3. `src/commands/index.ts`
Command registration via REST API:
- Load guildIds from config
- Register to each guild using `Routes.applicationGuildCommands`
- Called at startup before client login

### 4. `src/commands/model.ts`
- Validate command used in thread with active session
- Update `model_override` in database via `sessionManager.updateSessionModel()`
- Reply with confirmation (visible to all)

### 5. `src/commands/clear.ts`
- Show confirmation buttons (Danger: "Clear Session", Secondary: "Cancel")
- Use ephemeral reply with `awaitMessageComponent()`
- On confirm: call `sessionManager.clearSession(threadId)`
- 30-second timeout

### 6. `src/commands/resume.ts`
- Get sessions via `sessionManager.getChannelSessions(channelId)`
- Defer reply while fetching thread names from Discord API
- Build StringSelectMenu with: thread name (label), message count + agent + time ago (description)
- On selection: reply with thread URL link
- 60-second timeout

### 7. `src/discord/interaction-handler.ts`
- Listen to `Events.InteractionCreate`
- Route `isChatInputCommand()` to appropriate handler
- Error handling: catch errors and reply with ephemeral error message

## Files to Modify

### 1. `src/core/session-manager.ts`
**Schema migration** - Add `model_override TEXT DEFAULT NULL` column:
```typescript
// In initializeSchema(), add migration check
const columns = this.db.prepare("PRAGMA table_info(sessions)").all();
if (!columns.some(c => c.name === 'model_override')) {
  this.db.exec('ALTER TABLE sessions ADD COLUMN model_override TEXT DEFAULT NULL');
}
```

**Interface update**:
```typescript
export interface Session {
  // ... existing fields
  modelOverride: string | null;  // ADD
}
```

**New method**:
```typescript
updateSessionModel(threadId: string, model: string | null): void
```

**Update all SELECT queries** to include `model_override as modelOverride`

### 2. `src/core/query-executor.ts`
Add `modelOverride?: string` to QueryOptions interface.
Use it in sdkOptions: `model: modelOverride || agentConfig.model`

### 3. `src/discord/message-handler.ts`
Pass `modelOverride` to executeQuery:
```typescript
const queryGenerator = executeQuery({
  prompt,
  cwd: directory,
  sessionId: resumeSessionId,
  agentConfig: parsed.agentConfig,
  modelOverride: session.modelOverride ?? undefined,  // ADD
});
```

### 4. `src/index.ts`
- Add `DISCORD_CLIENT_ID` to required env vars
- Import and call `registerCommands(clientId, token)` before login
- Import and create `InteractionHandler` with the client
- Update `.env.example` to document `DISCORD_CLIENT_ID`

## Implementation Order

1. **Infrastructure**: Create `guilds.json`, `definitions.ts`, `index.ts` (commands)
2. **Database**: Modify `session-manager.ts` with migration + new method
3. **Command handlers**: Create `model.ts`, `clear.ts`, `resume.ts`
4. **Interaction handler**: Create `interaction-handler.ts`
5. **Integration**: Modify `query-executor.ts`, `message-handler.ts`, `index.ts`
6. **Testing**: Verify each command in Discord

## Discord.js Features Used

| Feature | Command | Purpose |
|---------|---------|---------|
| SlashCommandBuilder | All | Define commands |
| REST API | Registration | Deploy to guild |
| Ephemeral replies | /clear, /resume | Private feedback |
| ButtonBuilder | /clear | Confirm/cancel |
| StringSelectMenuBuilder | /resume | Session picker |
| awaitMessageComponent | /clear, /resume | Wait for user selection |
| deferReply | /resume | Show thinking while fetching threads |

## Key Decisions

1. **Model persistence**: Stored in `model_override` column, cleared on `/clear`
2. **Thread validation**: `/model` and `/clear` only work in threads with active sessions
3. **Select menu over autocomplete**: Richer display with descriptions, no 3-second timeout pressure
4. **Guild registration**: Instant updates, configurable via `guilds.json`

## Critical Files

- `src/core/session-manager.ts` - Schema + new method
- `src/index.ts` - Registration + handler init
- `src/discord/message-handler.ts` - Pass modelOverride
- `src/core/query-executor.ts` - Use modelOverride

---

## Documentation References

### Discord.js Official Guide
- [Creating Slash Commands](https://discordjs.guide/creating-your-bot/slash-commands) - Basic setup
- [Advanced Command Creation](https://discordjs.guide/slash-commands/advanced-creation) - Subcommands, options, choices
- [Autocomplete](https://discordjs.guide/slash-commands/autocomplete) - Dynamic suggestions (25 max, 3s timeout)
- [Response Methods](https://discordjs.guide/slash-commands/response-methods) - Reply, defer, ephemeral, followUp
- [Buttons](https://discordjs.guide/interactive-components/buttons) - ButtonBuilder, styles, collectors
- [Select Menus](https://discordjs.guide/interactive-components/select-menus) - StringSelectMenuBuilder, options
- [Modals](https://discordjs.guide/interactions/modals) - ModalBuilder, TextInputBuilder (for future use)
- [v14 Migration](https://discordjs.guide/additional-info/changes-in-v14.html) - Builder class renames

### Discord API Documentation
- [Application Commands](https://discord.com/developers/docs/interactions/application-commands)
- [Message Components](https://discord.com/developers/docs/interactions/message-components)

---

## Learnings & Tips

### Slash Command Registration

1. **Guild vs Global Registration**
   - Guild-specific: Instant updates, great for development
   - Global: Takes up to 1 hour to propagate
   - Use `Routes.applicationGuildCommands(clientId, guildId)` for guild
   - Use `Routes.applicationCommands(clientId)` for global

2. **Client ID Required**
   - Discord Client ID (Application ID) is needed for command registration
   - Found in Discord Developer Portal under your application
   - Different from Bot Token

### Interactive Components

3. **Select Menu vs Autocomplete**
   - **Autocomplete**: 3-second timeout, 25 choices max, cannot defer
   - **Select Menu**: 60+ second timeout, richer descriptions, can show after defer
   - Choose select menu when you need to fetch data (like thread names)

4. **awaitMessageComponent Pattern**
   ```typescript
   const response = await interaction.reply({ components: [row], ephemeral: true });
   const selection = await response.awaitMessageComponent({
     componentType: ComponentType.Button,
     time: 30_000,
   });
   await selection.update({ content: 'Done!', components: [] });
   ```

5. **Button Styles**
   - `ButtonStyle.Primary` - Blue (main action)
   - `ButtonStyle.Secondary` - Grey (cancel)
   - `ButtonStyle.Success` - Green (confirm positive)
   - `ButtonStyle.Danger` - Red (destructive actions)
   - `ButtonStyle.Link` - External URL (no interaction)

### Ephemeral Messages

6. **When to Use Ephemeral**
   - Error messages (only user needs to see)
   - Confirmation dialogs (private decision)
   - Selection menus (reduces channel clutter)
   - NOT for success messages others should see (like model change)

7. **Ephemeral Limitations**
   - Cannot change ephemeral state after sending
   - Use `flags: MessageFlags.Ephemeral` in reply options

### Response Timing

8. **3-Second Rule**
   - Discord requires acknowledgment within 3 seconds
   - Use `deferReply()` if your operation takes longer
   - Deferred replies show "Bot is thinking..." for up to 15 minutes

9. **Defer Pattern**
   ```typescript
   await interaction.deferReply({ ephemeral: true });
   // ... do slow work ...
   await interaction.editReply({ content: 'Done!' });
   ```

### TypeScript Tips

10. **Channel Type Narrowing**
    - `channel.name` can be `string | null` for some channel types
    - Always check: `if (channel && 'name' in channel && channel.name)`

11. **Interaction Type Guards**
    - `interaction.isChatInputCommand()` - Slash commands
    - `interaction.isButton()` - Button clicks
    - `interaction.isStringSelectMenu()` - Select menu selections
    - `interaction.isModalSubmit()` - Modal submissions

### SQLite Migrations

12. **Safe Column Addition**
    ```typescript
    const columns = db.prepare("PRAGMA table_info(table_name)").all();
    if (!columns.some(c => c.name === 'new_column')) {
      db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
    }
    ```

### Error Handling

13. **Robust Interaction Error Handler**
    ```typescript
    try {
      await commandHandler(interaction);
    } catch (error) {
      const msg = 'Something went wrong.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
    ```

---

## Future Enhancements

- `/plan` - Enter plan mode with modal for goal description
- `/permissions` - Toggle permission modes with select menu
- `/config` - Show/edit channel mappings
- `/agents` - List available agents with descriptions
- Autocomplete for model selection (dynamic from agents.json)
