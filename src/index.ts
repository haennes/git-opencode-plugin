import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Plugin, tool } from "@opencode-ai/plugin";

/** Suppress CRLF conversion warnings on Windows (keeps tool output readable). */
const GIT_CRLF_QUIET = "-c advice.convertCRLF=false";

const GIT_TOOLS_GUIDANCE = `<GIT_TOOLS_PLUGIN>
You have dedicated Git tools. Prefer them over raw \`git\` shell commands:

| Tool | Use when |
|------|----------|
| \`gitStatus\` | Check working tree, staged/unstaged files |
| \`gitDiff\` | View unstaged, staged, or branch diffs |
| \`gitLog\` | Recent commits, branch history |
| \`gitTree\` | Commit graph with branch topology |
| \`gitBranch\` | List, create, or switch branches |
| \`gitCommit\` | Stage files and commit (with message) |
| \`gitStash\` | Stash, pop, list, or drop changes |
| \`gitPrecommitReview\` | Review staged changes before committing |

Workflow: \`gitStatus\` → \`gitDiff staged:true\` → \`gitPrecommitReview\` → \`gitCommit\`.

Commit display rules (keep terminal clean):
- NEVER run bash \`git commit -m "..."\` — long inline messages clutter the terminal.
- ALWAYS use \`gitCommit\` — writes message via file, suppresses CRLF noise, returns a short summary.
- Subject (first line): ≤72 chars. Put details in the body after a blank line, not as shell bullets.
</GIT_TOOLS_PLUGIN>`;

type Shell = Plugin extends (input: infer I) => unknown ? I["$"] : never;

async function isGitRepo($: Shell, directory: string): Promise<boolean> {
  try {
    const result = await $`git -C ${directory} rev-parse --is-inside-work-tree`.text();
    return result.trim() === "true";
  } catch {
    return false;
  }
}

async function gitRoot($: Shell, directory: string): Promise<string | null> {
  try {
    return (await $`git -C ${directory} rev-parse --show-toplevel`.text()).trim();
  } catch {
    return null;
  }
}

/** Strip noisy git warnings (e.g. CRLF on Windows) from tool output. */
function sanitizeGitOutput(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^warning: in the working copy of /i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCommitMessage(message: string): string {
  return message.replace(/\r\n/g, "\n").trim();
}

function formatCommitResult(input: {
  hash: string;
  subject: string;
  branch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}): string {
  const { hash, subject, branch, filesChanged, insertions, deletions } = input;
  const stat =
    filesChanged > 0
      ? `${filesChanged} file${filesChanged === 1 ? "" : "s"} changed, ${insertions} insertion${insertions === 1 ? "" : "s"}(+), ${deletions} deletion${deletions === 1 ? "" : "s"}(-)`
      : "no file stats";
  return [
    `Committed ${hash} on ${branch || "(detached)"}`,
    subject,
    stat,
  ].join("\n");
}

async function parseLastCommitStat(
  $: Shell,
  directory: string,
): Promise<{ filesChanged: number; insertions: number; deletions: number }> {
  const raw = sanitizeGitOutput(
    (await $`git -C ${directory} show --stat --format= HEAD`.text()).trim(),
  );
  const summary = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /files? changed/.test(line));
  if (!summary) {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }
  const filesMatch = summary.match(/(\d+)\s+files? changed/);
  const insMatch = summary.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = summary.match(/(\d+)\s+deletions?\(-\)/);
  return {
    filesChanged: filesMatch ? Number(filesMatch[1]) : 0,
    insertions: insMatch ? Number(insMatch[1]) : 0,
    deletions: delMatch ? Number(delMatch[1]) : 0,
  };
}

export const GitToolsPlugin: Plugin = async ({ client, directory, $ }) => {
  const inRepo = await isGitRepo($, directory);
  const root = inRepo ? await gitRoot($, directory) : null;

  await client.app.log({
    body: {
      service: "opencode-git-tools",
      level: "info",
      message: inRepo ? `Git tools active (repo: ${root})` : "Git tools loaded (not in a git repo)",
    },
  });

  return {
    config: async (config) => {
      config.instructions = config.instructions ?? [];
      const marker = "opencode-git-tools";
      const hasMarker = config.instructions.some(
        (item) => typeof item === "string" && item.includes(marker),
      );
      if (!hasMarker) {
        config.instructions.push(
          "opencode-git-tools: prefer git* plugin tools over raw git bash; never git commit -m in shell — use gitCommit",
        );
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!inRepo || !output.messages.length) return;

      const firstUser = output.messages.find((m) => m.info.role === "user");
      if (!firstUser?.parts.length) return;
      if (firstUser.parts.some((p) => p.type === "text" && p.text.includes("<GIT_TOOLS_PLUGIN>"))) return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: "text", text: GIT_TOOLS_GUIDANCE });
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!inRepo) return;
      output.context.push(`
## Git Tools (opencode-git-tools)
Prefer plugin tools: gitStatus, gitDiff, gitLog, gitTree, gitBranch, gitCommit, gitStash, gitPrecommitReview.
Never use bash \`git commit -m\` — use gitCommit for quiet, formatted output.
Repo root: ${root}
`);
    },

    tool: {
      gitStatus: tool({
        description: "Get current Git repository status (prefer over bash git status)",
        args: {
          porcelain: tool.schema.boolean().optional().default(false),
        },
        async execute(args) {
          const flags = args.porcelain ? "--porcelain" : "";
          return sanitizeGitOutput(
            (await $`git ${GIT_CRLF_QUIET} -C ${directory} status ${flags}`.text()).trim(),
          );
        },
      }),

      gitDiff: tool({
        description: "Show Git diff for unstaged, staged, or between refs",
        args: {
          staged: tool.schema.boolean().optional().default(false),
          ref: tool.schema.string().optional().describe("Compare against ref, e.g. main or HEAD~1"),
        },
        async execute(args) {
          if (args.ref) {
            const diff = sanitizeGitOutput(
              (await $`git ${GIT_CRLF_QUIET} -C ${directory} diff ${args.ref}`.text()).trim(),
            );
            return diff || "No diff.";
          }
          const flags = args.staged ? "--cached" : "";
          const diff = sanitizeGitOutput(
            (await $`git ${GIT_CRLF_QUIET} -C ${directory} diff ${flags}`.text()).trim(),
          );
          return diff || "No diff.";
        },
      }),

      gitLog: tool({
        description: "Show recent Git commit history",
        args: {
          count: tool.schema.number().optional().default(10),
          oneline: tool.schema.boolean().optional().default(true),
        },
        async execute(args) {
          const format = args.oneline ? "--oneline" : "";
          return (await $`git -C ${directory} log -n ${args.count} ${format}`.text()).trim();
        },
      }),

      gitTree: tool({
        description:
          "Show Git commit tree graph with branch topology (prefer over bash git log --graph)",
        args: {
          count: tool.schema.number().optional().default(20),
          all: tool.schema
            .boolean()
            .optional()
            .default(false)
            .describe("Include all local and remote branches"),
          ref: tool.schema.string().optional().describe("Start from ref, e.g. main or HEAD~5"),
        },
        async execute(args) {
          const allFlag = args.all ? "--all" : "";
          const ref = args.ref ?? "";
          const tree = (
            await $`git -C ${directory} log --graph --oneline --decorate ${allFlag} -n ${args.count} ${ref}`
          ).text().trim();
          return tree || "No commits.";
        },
      }),

      gitCommit: tool({
        description:
          "Stage files and create a Git commit (quiet output; prefer over bash git commit -m)",
        args: {
          message: tool.schema
            .string()
            .describe("Commit message (subject ≤72 chars; body after blank line)"),
          files: tool.schema.array(tool.schema.string()).optional(),
          amend: tool.schema.boolean().optional().default(false),
        },
        async execute(args) {
          const msgPath = join(tmpdir(), `oc-git-commit-${Date.now()}.txt`);
          const message = normalizeCommitMessage(args.message);

          try {
            await writeFile(msgPath, message, "utf8");

            if (args.files?.length) {
              await $`git ${GIT_CRLF_QUIET} -C ${directory} add ${args.files}`;
            } else {
              await $`git ${GIT_CRLF_QUIET} -C ${directory} add -A`;
            }

            const amendFlag = args.amend ? "--amend" : "";
            await $`git ${GIT_CRLF_QUIET} -C ${directory} commit -F ${msgPath} -q ${amendFlag}`;

            const hash = (
              await $`git -C ${directory} rev-parse --short HEAD`.text()
            ).trim();
            const subject = (
              await $`git -C ${directory} log -1 --format=%s`.text()
            ).trim();
            const branch = (
              await $`git -C ${directory} branch --show-current`.text()
            ).trim();
            const stat = await parseLastCommitStat($, directory);

            return formatCommitResult({ hash, subject, branch, ...stat });
          } finally {
            await unlink(msgPath).catch(() => {});
          }
        },
      }),

      gitBranch: tool({
        description: "List, create, or switch Git branches",
        args: {
          action: tool.schema.enum(["list", "create", "switch"]).default("list"),
          branchName: tool.schema.string().optional(),
        },
        async execute(args) {
          if (args.action === "list") {
            return (await $`git -C ${directory} branch -a`.text()).trim();
          }
          if (args.action === "create" && args.branchName) {
            return (await $`git -C ${directory} checkout -b ${args.branchName}`.text()).trim();
          }
          if (args.action === "switch" && args.branchName) {
            return (await $`git -C ${directory} switch ${args.branchName}`.text()).trim();
          }
          return "Invalid action: provide branchName for create/switch.";
        },
      }),

      gitStash: tool({
        description: "Stash, pop, list, or drop Git stashes",
        args: {
          action: tool.schema.enum(["push", "pop", "list", "drop"]).default("list"),
          message: tool.schema.string().optional(),
          index: tool.schema.number().optional().default(0),
        },
        async execute(args) {
          if (args.action === "list") {
            return (await $`git -C ${directory} stash list`.text()).trim() || "No stashes.";
          }
          if (args.action === "push") {
            const msg = args.message ? `push -m ${args.message}` : "push";
            return (await $`git -C ${directory} stash ${msg}`.text()).trim();
          }
          if (args.action === "pop") {
            return (await $`git -C ${directory} stash pop stash@{${args.index}}`.text()).trim();
          }
          if (args.action === "drop") {
            return (await $`git -C ${directory} stash drop stash@{${args.index}}`.text()).trim();
          }
          return "Invalid stash action.";
        },
      }),

      gitPrecommitReview: tool({
        description: "Review staged changes before commit; call automatically before gitCommit",
        args: {
          maxChars: tool.schema.number().optional().default(8000),
        },
        async execute(args) {
          const diff = (await $`git -C ${directory} diff --cached`.text()).trim();
          if (!diff) return "No staged changes to review. Run gitStatus and stage files first.";

          const truncated = diff.length > args.maxChars;
          const body = truncated ? `${diff.slice(0, args.maxChars)}\n\n...(truncated)` : diff;

          const stat = (await $`git -C ${directory} diff --cached --stat`.text()).trim();

          return [
            "## Staged changes summary",
            stat,
            "",
            "## Staged diff",
            body,
            "",
            "Review checklist: logic errors, missing tests, secrets, unrelated files, commit scope.",
          ].join("\n");
        },
      }),
    },
  };
};

export default GitToolsPlugin;