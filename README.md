# opencode-git-tools

Global OpenCode plugin that registers Git tools and **automatically guides the AI** to use them instead of raw `git` bash commands.

## Features

- **7 Git tools**: `gitStatus`, `gitDiff`, `gitLog`, `gitBranch`, `gitCommit`, `gitStash`, `gitPrecommitReview`
- **Auto-context injection**: When working inside a Git repo, the plugin injects tool guidance into the first user message
- **Compaction context**: Git workflow hints survive session compaction
- **Slash commands**: `/git-status`, `/git-commit`, `/git-review`
- **Optional pre-commit hook**: Calls `opencode run gitPrecommitReview` before commits

## Install (recommended)

OpenCode loads plugins from `~/.config/opencode/plugins/` automatically at startup.

### One-step installer

**Windows**

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**Linux / macOS**

```bash
bash install.sh
```

Add `--hooks` (or `-Hooks` on Windows) to also install pre-commit hooks in the **current** git project.

### Legacy / partial installers

| Script | Purpose |
|--------|---------|
| `install.ps1` / `install.sh` | Global plugin (+ optional hooks) |
| `install-global.ps1` / `install-global.sh` | Global plugin only |
| `setup-git-hooks.ps1` / `setup-git-hooks.sh` | Project hooks only |
| `node scripts/install-global.mjs` | Global plugin (Node direct) |

After install, **restart OpenCode**.

## Verify

```bash
opencode run "call gitStatus and show the result"
```

Or in the TUI, run `/git-status`.

## Optional: project git hooks

Install pre-commit hooks in the **current** git project:

```bash
node scripts/install-git-hooks.mjs
```

Or use the legacy scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-git-hooks.ps1
```

```bash
bash setup-git-hooks.sh
```

## npm publish (optional)

Register in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["opencode-git-tools"]
}
```

See `opencode.json.example` for a full config snippet.

## How auto-call works

1. **Plugin tools** — Registered globally; OpenCode exposes them to the agent like built-in tools.
2. **Message transform hook** — In a Git repo, injects `<GIT_TOOLS_PLUGIN>` guidance so the model prefers `git*` tools.
3. **Compaction hook** — Re-injects Git tool reminders when context is compacted.
4. **Slash commands** — Explicit workflows (`/git-commit`, etc.) that reference plugin tools by name.

## Project structure

```
src/index.ts          # Main plugin (tools + hooks)
commands/             # Global slash commands (copied on install)
hooks/                # Optional git pre-commit hooks
scripts/              # install-global.mjs, install-git-hooks.mjs
```

## Tools reference

| Tool | Description |
|------|-------------|
| `gitStatus` | Working tree status |
| `gitDiff` | Unstaged, staged, or ref diff |
| `gitLog` | Recent commits |
| `gitBranch` | List / create / switch branches |
| `gitCommit` | Stage and commit |
| `gitStash` | Stash push / pop / list / drop |
| `gitPrecommitReview` | Review staged changes before commit |