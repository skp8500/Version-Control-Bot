# mygit Project

A minimal version control system in two forms:
1. **CLI tool** — C++17 binary with AI explanations after each command
2. **Web app** — Full-stack React+Vite + Express + PostgreSQL

## Architecture

### CLI (`mygit/`)
- `main.cpp` — CLI router
- `commands/init.cpp` — fully implemented; others are stubs
- `ai/bot.cpp` — Groq API AI bot (alternates models)
- `utils/hash.cpp` — djb2 hash (unsigned 64-bit)
- `Makefile` + `demo.sh`

### Web App

**Frontend** (`artifacts/mygit-web/`)
- `src/pages/Workspace.tsx` — full workspace UI:
  - Left sidebar: branch/HEAD, staged files, working tree, commit history
  - Main panel: file editor, commit interface, commit diff viewer
  - Bottom terminal: real mygit commands, arrow-key history, clear
  - Right AI bot panel: contextual chat with Groq API

**Backend** (`artifacts/api-server/`)
- `src/routes/mygit.ts` — REST API (10 endpoints)
- `src/routes/terminal.ts` — `POST /api/terminal`, `GET /api/terminal/history`
- `src/routes/aibot.ts` — `POST /api/bot/chat`, `GET /api/bot/history`
- `src/lib/mygitFs.ts` — filesystem mygit logic (TypeScript port of C++ CLI)
- `src/lib/mygitDb.ts` — DB-backed layer on top of filesystem

**Database** (`lib/db/`)
- Schema: `repositories`, `commits`, `commit_files`, `working_files`, `staged_files`, `terminal_history`, `ai_messages`
- ORM: Drizzle ORM with PostgreSQL
- Push schema: `cd lib/db && pnpm run push`

**Shared Libraries**
- `lib/api-spec/openapi.yaml` — OpenAPI spec
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod schemas

### Storage Strategy
- Filesystem (`.mygit/`) is the canonical source of truth for repo state
- PostgreSQL stores all history for queryability: terminal commands, AI conversations, commit metadata
- Repo path: `MYGIT_REPO_PATH` env var, defaults to `/home/runner/workspace/mygit-workspace/`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mygit/status` | Repo status |
| POST | `/api/mygit/init` | Initialize repository |
| GET | `/api/mygit/files` | List files |
| GET | `/api/mygit/file?path=` | Get file content |
| PUT | `/api/mygit/file` | Save file |
| POST | `/api/mygit/add` | Stage a file |
| POST | `/api/mygit/commit` | Create commit |
| GET | `/api/mygit/log` | Commit history |
| POST | `/api/mygit/checkout` | Restore to commit |
| GET | `/api/mygit/diff/:id` | File diff for commit |
| POST | `/api/terminal` | Execute mygit terminal command |
| GET | `/api/terminal/history` | Terminal command history |
| POST | `/api/bot/chat` | AI bot message |
| GET | `/api/bot/history` | AI conversation history |

## Secrets
- `GROQ_API_KEY` — Groq API (bot and CLI)
- `DATABASE_URL` + `PGHOST/PORT/USER/PASSWORD/DATABASE` — PostgreSQL (auto-set)

## Codegen
```
pnpm --filter @workspace/api-spec run codegen
```
