# Repository Guidelines

## Project Structure & Module Organization

- `src/index.ts`: main entry point (Discord client + component initialization).
- `src/discord/`: Discord integration (`message-handler.ts`, `stream-renderer.ts`).
- `src/core/`: routing + session + SDK integration (`channel-router.ts`, `session-manager.ts`, `query-executor.ts`).
- `src/formatters/`: Discord-friendly rendering for diffs/tool calls/code blocks.
- `src/config/`: runtime config (`channels.json` for channel→directory mapping, `agents.json` for alias/model config).
- `scripts/`: ad-hoc utilities (e.g., `scripts/test-integration.ts`).
- `data/`: runtime SQLite state (`data/sessions.db`, gitignored).
- `dist/`: TypeScript build output (gitignored).

## Build, Test, and Development Commands

- `npm install` (or `npm ci`): install dependencies (Node.js `>=20`).
- `npm run dev`: run with hot reload (`tsx watch src/index.ts`).
- `npm run build`: compile TypeScript to `dist/` (`tsc`).
- `npm start`: run the compiled bot (`node dist/index.js`).
- `npm run typecheck`: typecheck only (`tsc --noEmit`).
- `npx tsx scripts/test-integration.ts`: optional ad-hoc integration script.

## Coding Style & Naming Conventions

- TypeScript + ESM (`"type": "module"`). Use NodeNext-style imports with `.js` extensions for local modules (e.g., `import { x } from './core/foo.js'`).
- Match existing style: 2-space indentation, single quotes, trailing commas where present.
- Use kebab-case filenames aligned with the current layout (e.g., `session-manager.ts`, `channel-router.ts`).

## Testing Guidelines

- No dedicated unit test framework currently; the baseline is `npm run typecheck` plus a manual smoke test.
- Smoke test workflow: configure `.env` and `src/config/channels.json`, run `npm run dev`, mention `@claude` in a mapped channel, confirm a thread is created and replies stream; verify session persistence via `data/sessions.db` (not committed).

## Commit & Pull Request Guidelines

- Prefer Conventional Commit-style subjects (as used in recent history): `feat: ...`, `fix: ...`, `chore: ...`. Keep subjects imperative and ≤72 chars.
- PRs include: a short summary, exact testing steps, and (for Discord UX/formatting changes) screenshots of before/after behavior. Call out config or persistence changes (e.g., `src/config/*.json`, `SessionManager` schema).

## Security & Configuration Tips

- Never commit secrets: `.env` is ignored; update `.env.example` when adding new required variables.
- The bot intentionally runs with broad filesystem permissions; be cautious when changing channel→directory mappings and when expanding tool/command handling.
