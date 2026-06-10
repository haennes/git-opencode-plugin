#!/usr/bin/env bash
# OpenCode Git Hooks Setup - Linux/macOS

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/install-git-hooks.mjs"
elif command -v bun >/dev/null 2>&1; then
  bun run "$ROOT/scripts/install-git-hooks.mjs"
else
  echo "Node.js or Bun is required." >&2
  exit 1
fi

echo ""
echo "Git hooks installed. For global plugin, run: bash install.sh"
