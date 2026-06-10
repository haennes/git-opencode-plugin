#!/usr/bin/env node
/**
 * Install opencode-git-tools as a global OpenCode plugin.
 * - Copies plugin to ~/.config/opencode/plugins/ (auto-loaded at startup)
 * - Copies slash commands to ~/.config/opencode/commands/
 * - Ensures @opencode-ai/plugin dependency exists
 * - Registers in opencode.jsonc if not already present
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PLUGIN_NAME = "opencode-git-tools";
const PLUGIN_FILE = `${PLUGIN_NAME}.ts`;
const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = os.homedir();
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR
  ? path.resolve(process.env.OPENCODE_CONFIG_DIR.replace(/^~/, HOME))
  : path.join(HOME, ".config", "opencode");

const PLUGINS_DIR = path.join(CONFIG_DIR, "plugins");
const COMMANDS_DIR = path.join(CONFIG_DIR, "commands");
const TARGET_PLUGIN = path.join(PLUGINS_DIR, PLUGIN_FILE);

function toConfigPath(absPath) {
  const normalized = absPath.replace(/\\/g, "/");
  if (normalized.startsWith(HOME.replace(/\\/g, "/"))) {
    return `~${normalized.slice(HOME.replace(/\\/g, "/").length)}`;
  }
  if (process.platform === "win32" && /^[A-Za-z]:/.test(normalized)) {
    return `/${normalized[0].toLowerCase()}${normalized.slice(2)}`;
  }
  return normalized;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensurePackageJson() {
  const pkgFile = path.join(CONFIG_DIR, "package.json");
  let pkg = { dependencies: {} };
  let changed = false;
  if (await exists(pkgFile)) {
    pkg = JSON.parse(await fs.readFile(pkgFile, "utf8"));
    pkg.dependencies = pkg.dependencies ?? {};
  }
  if (!pkg.dependencies["@opencode-ai/plugin"]) {
    pkg.dependencies["@opencode-ai/plugin"] = "1.16.2";
    changed = true;
    console.log("Added @opencode-ai/plugin to global package.json");
  }
  if (changed || !(await exists(path.join(CONFIG_DIR, "node_modules", "@opencode-ai", "plugin")))) {
    await fs.writeFile(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    await installDependencies();
  }
}

async function installDependencies() {
  console.log("Installing dependencies in global OpenCode config...");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--prefix", CONFIG_DIR], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.warn(
      `npm install failed. Run manually: npm install --prefix "${CONFIG_DIR}"`,
    );
  }
}

async function registerInConfig(pluginEntry) {
  const candidates = ["opencode.jsonc", "opencode.json"];
  let configFile = null;
  for (const name of candidates) {
    const p = path.join(CONFIG_DIR, name);
    if (await exists(p)) {
      configFile = p;
      break;
    }
  }

  if (!configFile) {
    const newConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: [pluginEntry],
    };
    configFile = path.join(CONFIG_DIR, "opencode.jsonc");
    await fs.writeFile(configFile, JSON.stringify(newConfig, null, 2) + "\n", "utf8");
    console.log(`Created ${configFile}`);
    return;
  }

  const raw = await fs.readFile(configFile, "utf8");
  if (raw.includes(PLUGIN_NAME)) {
    console.log(`Plugin already referenced in ${configFile}`);
    return;
  }

  const pluginLine = `    "${pluginEntry}"`;
  let updated;
  if (/"plugin"\s*:\s*\[/.test(raw)) {
    updated = raw.replace(/("plugin"\s*:\s*\[)([\s\S]*?)(\])/m, (_match, open, inner, close) => {
      const trimmed = inner.trim().replace(/,\s*$/, "");
      const sep = trimmed.length ? ",\n" : "\n";
      return `${open}${inner.replace(/\s*,\s*$/, "")}${sep}${pluginLine}\n  ${close}`;
    });
  } else {
    updated = raw.replace(/\{/, `{\n  "plugin": [\n${pluginLine}\n  ],`);
  }

  await fs.writeFile(configFile, updated, "utf8");
  console.log(`Registered plugin in ${configFile}`);
}

async function main() {
  console.log(`Installing ${PLUGIN_NAME} globally...`);
  console.log(`Config dir: ${CONFIG_DIR}`);

  await fs.mkdir(PLUGINS_DIR, { recursive: true });
  await fs.mkdir(COMMANDS_DIR, { recursive: true });

  await fs.copyFile(path.join(ROOT, "src", "index.ts"), TARGET_PLUGIN);
  console.log(`Plugin -> ${TARGET_PLUGIN}`);

  if (await exists(path.join(ROOT, "commands"))) {
    for (const file of await fs.readdir(path.join(ROOT, "commands"))) {
      const dest = path.join(COMMANDS_DIR, file);
      await fs.copyFile(path.join(ROOT, "commands", file), dest);
      console.log(`Command -> ${dest}`);
    }
  }

  await ensurePackageJson();

  const pluginEntry = toConfigPath(TARGET_PLUGIN);
  await registerInConfig(pluginEntry);

  console.log("\nDone! Restart OpenCode to load the plugin.");
  console.log("Auto-loaded from: ~/.config/opencode/plugins/");
  console.log("Tools: gitStatus, gitDiff, gitLog, gitBranch, gitCommit, gitStash, gitPrecommitReview");
  console.log("Commands: /git-status, /git-commit, /git-review");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});