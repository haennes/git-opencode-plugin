#!/usr/bin/env node
/**
 * Install git pre-commit hooks in the current project's .git/hooks/
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOOKS_SRC = path.join(ROOT, "hooks");
const GIT_DIR = path.join(process.cwd(), ".git", "hooks");

async function main() {
  const gitExists = await fs.access(path.join(process.cwd(), ".git")).then(() => true).catch(() => false);
  if (!gitExists) {
    console.error("Not a git repository. Run from a project with .git/");
    process.exit(1);
  }

  await fs.mkdir(GIT_DIR, { recursive: true });
  for (const file of ["pre-commit", "pre-commit.ts"]) {
    await fs.copyFile(path.join(HOOKS_SRC, file), path.join(GIT_DIR, file));
    console.log(`Installed ${file}`);
  }

  console.log("\nPre-commit hook will call: opencode run gitPrecommitReview");
  console.log("Ensure opencode-git-tools is installed globally first.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});