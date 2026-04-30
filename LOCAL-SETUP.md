# Running mygit on your own machine (Local Host Deployment)

This guide gets the full mygit web app — the React frontend, the Express API,
and the Postgres-backed storage — running on `http://localhost:5000` from a
fresh clone of the repo in **about 5 minutes**.

---

## 1. Prerequisites

Install these once:

| Tool        | Minimum version | Install                                                     |
| ----------- | --------------- | ----------------------------------------------------------- |
| **Node.js** | 20.x or newer   | https://nodejs.org  (or `nvm install 20`)                   |
| **pnpm**    | 9.x or newer    | `npm install -g pnpm` — or see https://pnpm.io/installation |
| **Git**     | any             | https://git-scm.com                                         |

> Windows users: run the commands below in **WSL2** or **Git Bash**.
> The start script is a Bash script.

You also need a **Postgres database**. The two easiest options:

- **Neon** (recommended, free, no install) — https://neon.tech
  Create a project, copy the `postgres://...` connection string.
- **Local Postgres** — install via Homebrew / apt / the official installer,
  then create a database: `createdb mygit`.

---

## 2. Clone & install

```bash
git clone <your-fork-url> mygit
cd mygit
pnpm install
```

This installs every workspace package (frontend, API, shared libs) in one
shot.

---

## 3. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```dotenv
DATABASE_URL=postgres://user:pass@host/dbname?sslmode=require
SESSION_SECRET=<paste a long random string>
```

Generate a session secret quickly:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Optional but useful:

- `GROQ_API_KEY` — turns on the AI commit-explain and terminal chat features.
  Free key at https://console.groq.com.

---

## 4. Push the database schema

This creates all the tables (users, repos, commits, files, etc.) in your
database. Safe to re-run.

```bash
pnpm db:push
```

---

## 5. Start the app

```bash
pnpm dev
```

You'll see:

```
▶ Building API server...
▶ Starting API server on port 3001...
▶ Starting frontend on port 5000...
```

Open **http://localhost:5000** in your browser. Click **Sign Up**, create an
account, and you're in.

Press `Ctrl+C` once to stop both servers cleanly.

---

## 6. (Optional) Build the C++ `mygit` CLI

The web app is fully functional without the CLI. If you also want the
command-line tool:

```bash
cd mygit
make
export PATH="$PWD:$PATH"
mygit --help
```

Requires `g++` (Linux/macOS) or MinGW (Windows).

---

## What runs where

| Process    | Port | Where                                       |
| ---------- | ---- | ------------------------------------------- |
| Vite (web) | 5000 | `artifacts/mygit-web` (proxies `/api/*` →)  |
| Express    | 3001 | `artifacts/api-server`                      |
| Postgres   | —    | Whatever `DATABASE_URL` points to           |

You only ever open port **5000** in your browser — Vite proxies API calls to
3001 internally, so there are no CORS issues in dev.

---

## Common issues

**`DATABASE_URL is not set.`**
You skipped step 3, or your `.env` isn't in the repo root. Re-check.

**`relation "users" does not exist`**
You skipped step 4. Run `pnpm db:push`.

**`EADDRINUSE: address already in use :::5000` (or 3001)**
Another process is on that port. Either kill it or override:
`PORT=5050 API_PORT=3050 pnpm dev`.

**Browser shows a blank page or stale UI**
Hard-refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS).

**Neon SSL error**
Make sure your connection string ends with `?sslmode=require`.

---

## Production-style local run

For a closer-to-prod build (no Vite dev server, static assets served via
`vite preview`):

```bash
pnpm build
# in one terminal:
cd artifacts/api-server && PORT=3001 node --enable-source-maps ./dist/index.mjs
# in another:
cd artifacts/mygit-web && PORT=5000 API_PORT=3001 pnpm run serve
```
