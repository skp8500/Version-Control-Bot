# mygit — Full Platform

A GitHub-like version control platform in two forms:
1. **CLI tool** — C++17 binary with AI explanations
2. **Web platform** — Multi-user, React+Vite + Express + PostgreSQL

---

## Architecture

### CLI (`mygit/`)
- `main.cpp` — CLI router
- `commands/init.cpp` — fully implemented; others are stubs
- `ai/bot.cpp` — Groq API AI bot (alternates models)
- `utils/hash.cpp` — djb2 hash
- `Makefile` + `demo.sh`

### Web Platform

#### Frontend (`artifacts/mygit-web/`)
**Pages:**
- `/` → `Dashboard.tsx` — Public repo listing, search, create (requireAuth)
- `/repos/:id` → `RepoView.tsx` — File browser, editor, push, graph, conflicts
- `/workspace` → `Workspace.tsx` — Original single-repo workspace with terminal + AI bot

**Components:**
- `AuthModal.tsx` — Overlay modal (never redirects), login + signup tabs
- `CommitGraph.tsx` — D3.js force-directed commit DAG with click-to-diff
- `ConflictResolver.tsx` — Split-pane merge conflict UI (Keep Mine / Keep Theirs / Edit)
- `UploadDetector.tsx` — Zip/folder upload with auto language/framework detection

**Hooks:**
- `useAuth.ts` — `requireAuth(action)` pattern: if logged in → run action; else → show AuthModal then run action

#### Backend (`artifacts/api-server/`)
**Auth routes** (`src/routes/auth.ts`):
- `POST /api/auth/register` — creates user, returns JWT
- `POST /api/auth/login` — verifies password, returns JWT
- `GET /api/auth/me` — validate token

**Repo routes** (`src/routes/repos.ts`):
- `GET /api/repos` — public list (no auth)
- `POST /api/repos` — create (JWT required)
- `GET /api/repos/:id` — repo info (public)
- `GET /api/repos/:id/files` — file tree (public)
- `GET /api/repos/:id/commits` — commit history (public)
- `GET /api/repos/:id/graph` — graph data for D3 (public)
- `GET /api/repos/:id/diff/:hash` — diff for a commit (public)
- `POST /api/repos/:id/commit` — push commit (JWT required), conflict detection returns 409
- `POST /api/repos/:id/upload` — zip/file upload (JWT required), auto-detect lang/framework
- `POST /api/repos/:id/resolve` — resolve conflict (JWT required)
- `GET /api/repos/:id/conflicts` — open conflicts (public)
- `POST /api/explain` — AI explanation via Groq (public, guests can use too)

**Middleware:**
- `optionalAuth` — attaches user if valid JWT present, never blocks
- `strictAuth` — returns 401 if no valid JWT

**Legacy mygit routes** (`src/routes/mygit.ts`):
- All original 10 endpoints still work for the single-repo Workspace page
- Terminal: `POST /api/terminal`, `GET /api/terminal/history`
- AI Bot: `POST /api/bot/chat`, `GET /api/bot/history`

#### Database (`lib/db/`)
**Tables:**
- `users` — id, username, email, password_hash, created_at
- `repositories` — id, user_id, name, description, repo_path, branch, head_hash, is_public, language, framework, initialized_at
- `commits` — id, repo_id, hash, message, parent_hash, author, created_at
- `commit_files` — id, commit_id, path, content, status
- `working_files` — id, repo_id, path, content, updated_at
- `staged_files` — id, repo_id, path
- `conflicts` — id, repo_id, file_path, base_content, ours, theirs, resolved, created_at
- `terminal_history` — id, repo_id, command, output, success, executed_at
- `ai_messages` — id, repo_id, role, content, created_at

Push schema: `cd lib/db && pnpm run push`

---

## Auth Philosophy

**GUEST mode** — No login needed for:
- Browse all public repos and files
- View commit graph, click nodes → see diffs
- Run the AI bot

**Auth triggered** (login modal appears) only when:
- Creating a repo
- Pushing/committing changes
- Editing files
- Uploading files
- Resolving conflicts

Auth flow: modal overlay on current page → after login, modal closes → pending action executes automatically.  
JWT stored in `localStorage` as `mygit_token`. User info stored as `mygit_user`.

---

## Multi-Repo Storage
- Repos created via web UI store files in the DB (`commit_files`, `working_files`)
- Repo filesystem path: `MYGIT_WORKSPACES_ROOT/{userId}-{name}/` (default: `/home/runner/workspace/mygit-workspaces/`)
- Original single-repo workspace uses `MYGIT_REPO_PATH` (default: `/home/runner/workspace/mygit-workspace/`)

---

## Secrets
- `GROQ_API_KEY` — Groq API (bot, CLI, AI explanations)
- `SESSION_SECRET` — JWT signing secret (fallback: `mygit-dev-secret`)
- `DATABASE_URL` + `PGHOST/PORT/USER/PASSWORD/DATABASE` — PostgreSQL (auto-set by Replit)

---

## Codegen
```
pnpm --filter @workspace/api-spec run codegen
```
