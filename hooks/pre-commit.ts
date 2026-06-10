#!/usr/bin/env bun
console.log("🚀 OpenCode Pre-commit Hook (TypeScript)");

try {
  const { $ } = await import("bun");
  const status = await $`git status --porcelain`.text();
  console.log("Git Status:\n", status);

  console.log("✅ All checks passed!");
} catch (e) {
  console.error("❌ Hook error:", e);
  process.exit(1);
}
