#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# mygit — unified start script (works on Replit and any local machine)
#
# Boots:
#   • API server (Express)  on $API_PORT  (default 3001)
#   • Web frontend (Vite)   on $PORT      (default 5000)
#
# Required env vars:
#   DATABASE_URL    Postgres connection string (Neon/Supabase/local)
#
# Optional env vars:
#   PORT                  Web dev-server port (default 5000)
#   API_PORT              API server port     (default 3001)
#   SESSION_SECRET        JWT signing secret  (recommended in prod)
#   GROQ_API_KEY          Enables AI commit-explain & chat
#   CORS_ORIGIN           Comma-separated list of allowed origins
#   MYGIT_WORKSPACES_ROOT Where per-repo working dirs live
#   MYGIT_REPO_PATH       Where the legacy single-repo dir lives
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Resolve repo root from this script's location so it works no matter where
# you invoke it from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Auto-load .env in the repo root if present (handy for local dev).
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${REPO_ROOT}/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL is not set."
  echo "  • On Replit: open the Database tab and provision Postgres."
  echo "  • Locally:  copy .env.example to .env and fill in DATABASE_URL"
  echo "              (Neon free tier works great: https://neon.tech)."
  exit 1
fi

API_PORT="${API_PORT:-3001}"
WEB_PORT="${PORT:-5000}"

echo "▶ Building API server..."
( cd "${REPO_ROOT}/artifacts/api-server" && pnpm run build )

echo "▶ Starting API server on port ${API_PORT}..."
( cd "${REPO_ROOT}/artifacts/api-server" \
  && PORT="${API_PORT}" node --enable-source-maps ./dist/index.mjs ) &
API_PID=$!

echo "▶ Starting frontend on port ${WEB_PORT}..."
( cd "${REPO_ROOT}/artifacts/mygit-web" \
  && PORT="${WEB_PORT}" API_PORT="${API_PORT}" pnpm run dev ) &
VITE_PID=$!

cleanup() {
  echo
  echo "▶ Shutting down..."
  kill "${API_PID}" "${VITE_PID}" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT EXIT

# Exit when either child exits
wait -n
