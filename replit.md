# mygit Project

A minimal version control system implemented in two complementary ways:
1. **CLI tool** — C++17 binary with AI-powered explanations after each command
2. **Web app** — Full-stack React+Vite frontend + Express backend with the same `.mygit/` filesystem logic

## Architecture

### CLI (`mygit/`)
- `main.cpp` — CLI router (dispatches to command handlers)
- `commands/init.cpp` — `mygit init` implementation (fully working)
- `commands/*.cpp` — `add`, `commit`, `log`, `checkout`, `merge`, `revert` (stubs)
- `ai/bot.cpp` — Groq API AI bot (alternates between `llama-3.3-70b-versatile` and `qwen/qwen3-32b`); explains each command after it runs
- `utils/hash.cpp` — djb2 hash (unsigned 64-bit, matches C++ `unsigned long` semantics)
- `utils/file.cpp` — filesystem helpers
- `Makefile` — builds the binary
- `demo.sh` — demo script run by the workflow

### Web App (Full-Stack)

**Frontend** (`artifacts/mygit-web/`) — React + Vite + TypeScript
- `src/pages/Workspace.tsx` — Main workspace: sidebar (branch/HEAD, staged files, working tree, commit history) + main panel (file editor, commit interface, diff viewer)
- `src/App.tsx` — Router, QueryClient, Toaster
- `src/main.tsx` — Mounts React, adds `dark` class for default dark mode
- `src/index.css` — Dark IDE-like theme

**Backend** (`artifacts/api-server/`) — Express + TypeScript
- `src/routes/mygit.ts` — All mygit REST endpoints
- `src/lib/mygitFs.ts` — Pure filesystem mygit logic (TypeScript port of CLI logic)

**Shared Libraries**
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/api-client-react/` — Generated React Query hooks (via Orval codegen)
- `lib/api-zod/` — Generated Zod validation schemas (via Orval codegen)

### Storage
- Repo stored at `MYGIT_REPO_PATH` env var, defaults to `/home/runner/workspace/mygit-workspace/`
- No database — pure filesystem (`.mygit/` directory structure matches CLI)
- djb2 hash uses BigInt in TypeScript for 64-bit correctness

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mygit/status` | Repo status (initialized, HEAD, branch, staged, files) |
| POST | `/api/mygit/init` | Initialize repository |
| GET | `/api/mygit/files` | List working directory files with content |
| GET | `/api/mygit/file?path=...` | Get single file content |
| PUT | `/api/mygit/file` | Save file content |
| POST | `/api/mygit/add` | Stage a file |
| POST | `/api/mygit/commit` | Create a commit |
| GET | `/api/mygit/log` | Get commit history |
| POST | `/api/mygit/checkout` | Restore working directory to a commit |
| GET | `/api/mygit/diff/:commitId` | Get file-by-file diff for a commit |

## Workflows
- `mygit: build & run` — Compiles the C++ CLI and runs the demo
- `artifacts/mygit-web: web` — Vite dev server for the React frontend (port 23239, preview at `/`)
- `artifacts/api-server: API Server` — Express backend (port 8080, all routes under `/api`)

## Secrets
- `GROQ_API_KEY` — Used by CLI AI bot to call Groq API
- `ANTHROPIC_API_KEY` — Set but contains invalid key (unused)
- `SESSION_SECRET` — Set but unused currently

## Codegen
Run after changing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run codegen
```
