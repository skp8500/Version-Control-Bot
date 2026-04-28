#!/usr/bin/env bash
# ── mygit demo ────────────────────────────────────────────────────────────────
# Builds mygit and runs a live demonstration in a sandboxed temp directory.
# Run from the mygit/ directory: bash demo.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEMO_DIR="/tmp/mygit_demo"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Building mygit..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR"
make -s

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Setting up demo directory: $DEMO_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rm -rf "$DEMO_DIR"
mkdir -p "$DEMO_DIR"
cd "$DEMO_DIR"

MYGIT="$SCRIPT_DIR/mygit"

echo ""
echo "▶  mygit init"
echo "─────────────────────────────────────────────"
"$MYGIT" init

echo ""
echo "▶  Creating sample files..."
echo "─────────────────────────────────────────────"
echo "Hello, mygit!" > hello.txt
echo "int main() { return 0; }" > main.cpp
echo "Files created: hello.txt  main.cpp"

echo ""
echo "▶  Error test: command without a repo (different dir)"
echo "─────────────────────────────────────────────"
( cd /tmp && "$MYGIT" add nonexistent.txt 2>&1 ) || true

echo ""
echo "▶  mygit add (stub — not built yet)"
echo "─────────────────────────────────────────────"
"$MYGIT" add hello.txt

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " .mygit/ directory structure:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
find .mygit -type f -o -type d | sort | sed 's/^/  /'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " HEAD contents:  $(cat .mygit/HEAD)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Demo complete. Binary is at: $MYGIT"
echo "Add it to your PATH:  export PATH=\"\$PATH:$SCRIPT_DIR\""
