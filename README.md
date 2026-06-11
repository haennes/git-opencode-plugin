# opencode-git-tools

Global OpenCode plugin that registers Git tools and **automatically guides the AI** to use them instead of raw `git` bash commands.

## Features

- **8 Git tools**: `gitStatus`, `gitDiff`, `gitLog`, `gitTree`, `gitBranch`, `gitCommit`, `gitStash`, `gitPrecommitReview`
- **Auto-context injection**: When working inside a Git repo, the plugin injects tool guidance into the first user message
- **Compaction context**: Git workflow hints survive session compaction
- **Slash commands**: `/git-status`, `/git-tree`, `/git-commit`, `/git-review`
- **Optional pre-commit hook**: Calls `opencode run gitPrecommitReview` before commits

## For humans — quick start

### Install (recommended)

OpenCode loads plugins from `~/.config/opencode/plugins/` automatically at startup.

#### One-step installer

**Windows**

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**Linux / macOS**

```bash
bash install.sh
```

Add `--hooks` (or `-Hooks` on Windows) to also install pre-commit hooks in the **current** git project.

#### What gets installed

| Path | Purpose |
|------|---------|
| `~/.config/opencode/plugins/opencode-git-tools.ts` | Plugin entrypoint |
| `~/.config/opencode/commands/git-*.md` | Slash commands |
| `~/.config/opencode/package.json` | Local plugin dependency metadata |

This plugin is a single TypeScript entrypoint, so it is safe to install directly
in the plugins root. Plugins with helper modules should use a subdirectory with
an `index.ts` entrypoint.

#### Legacy / partial installers

| Script | Purpose |
|--------|---------|
| `install.ps1` / `install.sh` | Global plugin (+ optional hooks) |
| `install-global.ps1` / `install-global.sh` | Global plugin only |
| `setup-git-hooks.ps1` / `setup-git-hooks.sh` | Project hooks only |
| `node scripts/install-global.mjs` | Global plugin (Node direct) |

After install, **restart OpenCode**.

### Verify

```bash
opencode run "call gitStatus and show the result"
```

Or in the TUI, run `/git-status`.

### Optional: project git hooks

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

## For AI agents — operating instructions

<!-- AGENT_README: opencode-git-tools v1.0 -->

You have **git\*** plugin tools. Prefer them over raw shell `git` commands,
especially on Windows where long command strings and CRLF warnings make terminal
output noisy.

### Decision: when to USE git*

| Task | Tool |
|------|------|
| See current worktree state | `gitStatus` |
| Review unstaged or staged changes | `gitDiff` |
| Inspect recent commits | `gitLog` |
| See branch topology | `gitTree` |
| List/create/switch branches | `gitBranch` |
| Stage and commit | `gitCommit` |
| Stash work | `gitStash` |
| Review staged diff before commit | `gitPrecommitReview` |

**Commit workflow:** `gitStatus` → `gitDiff` → `gitPrecommitReview` →
`gitCommit`.

### Decision: when NOT to use

| Situation | Use instead |
|-----------|-------------|
| Non-git file search | `Read` / `Grep` / codebase-memory-mcp |
| Bash-specific scripts | `bashExec` from git-bash-opencode-plugin |
| User explicitly asks for raw command output | Shell is OK, but explain why |
| Destructive git operations | Ask first |

### Rules

1. Use `gitCommit` instead of `git commit -m`; it writes messages through a file
2. Keep commit subjects <= 72 chars; put details in the body
3. Run `gitPrecommitReview` before committing staged changes
4. Do not run `git reset --hard`, force push, or delete branches without user confirmation
5. Pair with [git-bash-opencode-plugin](https://github.com/stevenke1981/git-bash-opencode-plugin) for Unix shell tools
6. When editing plugin code, keep `git -c advice.convertCRLF=false` as separate
   argv tokens; do not interpolate `"-c advice.convertCRLF=false"` as one string

<!-- END_AGENT_README -->

## How auto-call works

1. **Plugin tools** — Registered globally; OpenCode exposes them to the agent like built-in tools.
2. **Message transform hook** — In a Git repo, injects `<GIT_TOOLS_PLUGIN>` guidance so the model prefers `git*` tools.
3. **Compaction hook** — Re-injects Git tool reminders when context is compacted.
4. **Slash commands** — Explicit workflows (`/git-commit`, etc.) that reference plugin tools by name.

## Documentation

- **[OpenCode Tools 製作流程參考](docs/OPENCODE_TOOLS_GUIDE.md)** — 從零建立 Plugin、自訂 Tools、Hooks、Slash Commands 的完整步驟（含本專案實作解析、檢查清單與最小範本）

## Project structure

```
src/index.ts          # Main plugin (tools + hooks)
commands/             # Global slash commands (copied on install)
docs/                 # Developer guides
hooks/                # Optional git pre-commit hooks
scripts/              # install-global.mjs, install-git-hooks.mjs
```

## Tools reference

| Tool | Description |
|------|-------------|
| `gitStatus` | Working tree status |
| `gitDiff` | Unstaged, staged, or ref diff |
| `gitLog` | Recent commits |
| `gitTree` | Commit graph with branch topology |
| `gitBranch` | List / create / switch branches |
| `gitCommit` | Stage and commit (quiet output, formatted summary) |
| `gitStash` | Stash push / pop / list / drop |
| `gitPrecommitReview` | Review staged changes before commit |
