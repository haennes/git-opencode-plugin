#!/usr/bin/env bash
# Install opencode-git-tools as a global OpenCode plugin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Installing opencode-git-tools globally..."

if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/install-global.mjs"
elif command -v bun >/dev/null 2>&1; then
  bun run "$ROOT/scripts/install-global.mjs"
else
  echo "Node.js or Bun is required." >&2
  exit 1
fi

echo ""
echo "Restart OpenCode to activate the plugin."