#!/usr/bin/env bash
# Install opencode-git-tools (global OpenCode plugin + optional git hooks)
# Usage:
#   bash install.sh
#   bash install.sh --hooks

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOOKS=false

for arg in "$@"; do
  case "$arg" in
    --hooks) HOOKS=true ;;
    -h|--help)
      echo "Usage: bash install.sh [--hooks]"
      echo "  --hooks  Install pre-commit hooks in the current git project"
      exit 0
      ;;
  esac
done

run_node_script() {
  local script="$1"
  if command -v node >/dev/null 2>&1; then
    node "$script"
  elif command -v bun >/dev/null 2>&1; then
    bun run "$script"
  else
    echo "Node.js or Bun is required." >&2
    exit 1
  fi
}

echo "opencode-git-tools installer"
echo "============================"
echo ""
echo "[1/2] Installing global OpenCode plugin..."
run_node_script "$ROOT/scripts/install-global.mjs"

if [ "$HOOKS" = true ]; then
  echo ""
  echo "[2/2] Installing git pre-commit hooks in current project..."
  run_node_script "$ROOT/scripts/install-git-hooks.mjs"
else
  echo ""
  echo "[2/2] Skipped git hooks (use --hooks to install in current repo)."
fi

echo ""
echo "Done! Restart OpenCode to activate the plugin."
echo 'Verify: opencode run "call gitStatus and show the result"'