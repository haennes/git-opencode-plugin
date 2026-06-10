import { type Plugin, tool } from "@opencode-ai/plugin";

const GIT_TOOLS_GUIDANCE = `<GIT_TOOLS_PLUGIN>
You have dedicated Git tools. Prefer them over raw \`git\` shell commands:

| Tool | Use when |
|------|----------|
| \`gitStatus\` | Check working tree, staged/unstaged files |
| \`gitDiff\` | View unstaged, staged, or branch diffs |
| \`gitLog\` | Recent commits, branch history |
| \`gitBranch\` | List, create, or switch branches |
| \`gitCommit\` | Stage files and commit (with message) |
| \`gitStash\` | Stash, pop, list, or drop changes |
| \`gitPrecommitReview\` | Review staged changes before committing |

Workflow: \`gitStatus\` → \`gitDiff staged:true\` → \`gitPrecommitReview\` → \`gitCommit\`.
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
        config.instructions.push("opencode-git-tools: prefer git* plugin tools over raw git bash");
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
Prefer plugin tools: gitStatus, gitDiff, gitLog, gitBranch, gitCommit, gitStash, gitPrecommitReview.
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
          return (await $`git -C ${directory} status ${flags}`.text()).trim();
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
            return (await $`git -C ${directory} diff ${args.ref}`.text()).trim() || "No diff.";
          }
          const flags = args.staged ? "--cached" : "";
          const diff = (await $`git -C ${directory} diff ${flags}`.text()).trim();
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

      gitCommit: tool({
        description: "Stage files and create a Git commit",
        args: {
          message: tool.schema.string().describe("Commit message"),
          files: tool.schema.array(tool.schema.string()).optional(),
          amend: tool.schema.boolean().optional().default(false),
        },
        async execute(args) {
          if (args.files?.length) {
            await $`git -C ${directory} add ${args.files}`;
          } else {
            await $`git -C ${directory} add -A`;
          }
          const flags = args.amend ? "--amend" : "";
          const result = await $`git -C ${directory} commit -m ${args.message} ${flags}`.text();
          return `Commit successful:\n${result.trim()}`;
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