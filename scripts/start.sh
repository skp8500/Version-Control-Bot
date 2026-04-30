#!/bin/bash
set -e

# Build and start the API server in the background
echo "Building API server..."
cd /home/runner/workspace/artifacts/api-server
pnpm run build
echo "Starting API server on port ${API_PORT:-3001}..."
node --enable-source-maps ./dist/index.mjs &
API_PID=$!

# Start the frontend dev server
echo "Starting frontend on port ${PORT:-5000}..."
cd /home/runner/workspace/artifacts/mygit-web
pnpm run dev &
VITE_PID=$!

# Cleanup on exit
trap "kill $API_PID $VITE_PID 2>/dev/null; exit" SIGTERM SIGINT

wait -n
