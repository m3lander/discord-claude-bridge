# TODO

Project roadmap and pending changes for Discord-Claude Bridge.

## In Progress

_Nothing currently in progress_

## Planned Features

### Multi-Agent Support
- [ ] Multiple bot personalities with different models/prompts (partially implemented via agents.json)
- [ ] Per-channel agent overrides
- [ ] Agent switching mid-conversation

### Session Management
- [ ] Session timeout/cleanup automation
- [ ] Session forking (branch a conversation)
- [ ] Export conversation history

### Discord UX
- [ ] Slash commands (`/compact`, `/clear`, `/status`)
- [ ] Reaction-based controls (cancel, retry)
- [ ] File attachment handling (images, documents)
- [ ] Message splitting for responses > 2000 chars

### Streaming Improvements
- [ ] Better diff visualization for large edits
- [ ] Collapsible tool call sections
- [ ] Progress indicators for long-running tools

### Configuration
- [ ] Hot-reload of channel/agent configs without restart
- [ ] Web dashboard for config management
- [ ] Per-user settings and permissions

## Known Issues

_No known issues currently tracked_

## Completed

- [x] Initial implementation with streaming support
- [x] Thread-based session persistence (SQLite)
- [x] Channel → directory mapping
- [x] Agent aliases (@claude, @opus, @review, @haiku)
- [x] Debounced Discord message updates
- [x] Triple backtick escaping in formatters
- [x] CLAUDE.md documentation
