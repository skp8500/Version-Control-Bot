#!/bin/bash
set -e

# Build and start the API server on its own port (override the shared PORT=5000)
echo "Building API server..."
cd /home/runner/workspace/artifacts/api-server
pnpm run build
echo "Starting API server on port 3001..."
PORT=3001 node --enable-source-maps ./dist/index.mjs &
API_PID=$!

# Start the frontend dev server on port 5000
echo "Starting frontend on port 5000..."
cd /home/runner/workspace/artifacts/mygit-web
PORT=5000 pnpm run dev &
VITE_PID=$!

# Cleanup on exit
trap "kill $API_PID $VITE_PID 2>/dev/null; exit" SIGTERM SIGINT

wait -n
