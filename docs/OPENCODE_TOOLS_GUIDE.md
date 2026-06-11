# OpenCode Tools 製作流程參考

本文件以本專案 `opencode-git-tools` 為範例，說明如何從零建立 **OpenCode Plugin + 自訂 Tools + Slash Commands**，讓 AI 優先使用你的工具，而不是直接跑 bash。

官方文件：

- [Plugins](https://opencode.ai/docs/plugins/)
- [Custom Tools](https://opencode.ai/docs/custom-tools/)
- [Commands](https://opencode.ai/docs/commands/)

---

## 1. 先釐清：兩種建立 Tools 的方式

OpenCode 支援兩種路徑，用途不同：

| 方式 | 放置位置 | 適合情境 |
|------|----------|----------|
| **獨立 Tool 檔** | `.opencode/tools/` 或 `~/.config/opencode/tools/` | 單一功能、一檔一 tool、不需 hook |
| **Plugin 內嵌 Tools** | `.opencode/plugins/` 或 `~/.config/opencode/plugins/` | 多個相關 tool、需要 hook、要引導 AI 行為 |

本專案採用 **Plugin 內嵌 Tools**，因為 Git 操作需要：

1. 一次註冊多個相關 tool（`gitStatus`、`gitCommit`…）
2. 用 hook 自動注入「請用 plugin tool，別用 bash git」
3. 在 context compaction 後仍保留 Git 工作流程提示
4. 搭配 slash commands（`/git-commit`）形成固定流程

---

## 2. 本專案目錄結構

```
opencode-git-tools/
├── src/
│   └── index.ts              # Plugin 主檔：tools + hooks
├── commands/                 # Slash commands（安裝時複製到全域）
│   ├── git-status.md
│   ├── git-commit.md
│   ├── git-review.md
│   └── git-tree.md
├── hooks/                    # 可選：專案 git pre-commit hook
│   ├── pre-commit
│   └── pre-commit.ts
├── scripts/
│   ├── install-global.mjs    # 安裝 plugin + commands 到 ~/.config/opencode
│   └── install-git-hooks.mjs # 安裝 git hook 到目前專案
├── install.ps1 / install.sh  # 一鍵安裝入口
├── opencode.json.example     # 設定範例
└── package.json
```

安裝後，OpenCode 實際載入位置：

```
~/.config/opencode/
├── plugins/
│   └── opencode-git-tools.ts   # 從 src/index.ts 複製
├── commands/
│   ├── git-status.md
│   ├── git-commit.md
│   └── ...
├── package.json                  # 含 @opencode-ai/plugin 依賴
├── node_modules/
└── opencode.jsonc                # plugin 路徑註冊
```

---

## 3. 從零開始：完整製作流程

### Step 0：需求拆解

在寫程式前，先回答：

1. **要封裝哪些操作？**（例：status、diff、commit）
2. **AI 目前用 bash 會遇到什麼問題？**（例：終端機輸出太亂、CRLF 警告洗版）
3. **要不要固定工作流程？**（例：status → diff → review → commit）
4. **要不要 slash command？**（例：`/git-commit`）
5. **安裝範圍？** 全域（所有專案）或專案內（`.opencode/`）

### Step 1：建立專案骨架

```bash
mkdir my-opencode-plugin && cd my-opencode-plugin
npm init -y
```

`package.json` 最小設定：

```json
{
  "name": "my-opencode-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.0.0"
  }
}
```

### Step 2：撰寫 Plugin 主檔

建立 `src/index.ts`：

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async ({ client, directory, $ }) => {
  // 啟動時寫 log（不要用 console.log）
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: `Plugin loaded in ${directory}`,
    },
  });

  return {
    // hooks 放這裡
    tool: {
      // 自訂 tools 放這裡
    },
  };
};

export default MyPlugin;
```

**Plugin 函式收到的 context：**

| 參數 | 用途 |
|------|------|
| `directory` | 目前工作目錄 |
| `worktree` | Git worktree 根目錄 |
| `client` | OpenCode SDK（log、API 互動） |
| `$` | Bun Shell API，執行外部指令 |
| `project` | 專案資訊 |

### Step 3：定義一個 Tool

使用 `tool()` helper，參數用 Zod schema（`tool.schema`）：

```typescript
myStatus: tool({
  description: "Get project status (prefer over bash)",
  args: {
    verbose: tool.schema.boolean().optional().default(false),
  },
  async execute(args) {
    // 用 $ 執行 shell，回傳字串給 AI
    const flags = args.verbose ? "-v" : "";
    return (await $`git -C ${directory} status ${flags}`.text()).trim();
  },
}),
```

**Tool 設計原則：**

- `description` 要寫「何時用、優於 bash 的原因」
- 參數用 `.describe()` 補充語意
- `execute` 回傳 **精簡、可讀的字串**，不要把整段 raw terminal 輸出原樣丟回
- 需要長文字輸入時（如 commit message），**寫入暫存檔**，不要塞進 `-m "..."`

### Step 4：註冊多個 Tool

Plugin 的 `tool` 物件可放多個 tool：

```typescript
return {
  tool: {
    gitStatus: tool({ /* ... */ }),
    gitDiff: tool({ /* ... */ }),
    gitCommit: tool({ /* ... */ }),
  },
};
```

AI 呼叫時使用 tool 名稱：`gitStatus`、`gitCommit` 等。

### Step 5：加入 Hooks 引導 AI

僅註冊 tool 不夠，模型仍可能跑 `bash git ...`。需要 hook 主動提醒。

#### 5.1 `config` — 全域 instruction

```typescript
config: async (config) => {
  config.instructions = config.instructions ?? [];
  config.instructions.push(
    "my-plugin: prefer myPlugin* tools over raw bash",
  );
},
```

#### 5.2 `experimental.chat.messages.transform` — 注入首則使用者訊息

在對話開始時，把工具使用說明插到第一則 user message 前面：

```typescript
"experimental.chat.messages.transform": async (_input, output) => {
  const firstUser = output.messages.find((m) => m.info.role === "user");
  if (!firstUser?.parts.length) return;

  // 避免重複注入
  if (firstUser.parts.some((p) => p.type === "text" && p.text.includes("<MY_PLUGIN>"))) return;

  const ref = firstUser.parts[0];
  firstUser.parts.unshift({
    ...ref,
    type: "text",
    text: `<MY_PLUGIN>
Use myStatus, myCommit instead of bash.
</MY_PLUGIN>`,
  });
},
```

#### 5.3 `experimental.session.compacting` — 壓縮後保留上下文

Session 被 compact 後，預設 prompt 可能遺失工具提示。用此 hook 補回：

```typescript
"experimental.session.compacting": async (_input, output) => {
  output.context.push(`
## My Plugin
Prefer: myStatus, myCommit. Never bash equivalent.
`);
},
```

#### 5.4 其他常用 Hook（依需求選用）

| Hook | 用途 |
|------|------|
| `tool.execute.before` | 攔截 / 修改 tool 執行前的參數 |
| `tool.execute.after` | 執行後處理結果 |
| `shell.env` | 注入環境變數到所有 shell |
| `event` | 訂閱 `session.idle` 等事件 |

範例：禁止讀 `.env`

```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath?.includes(".env")) {
    throw new Error("Do not read .env files");
  }
},
```

### Step 6：建立 Slash Commands

在 `commands/` 放 markdown，檔名即指令名：

`commands/my-commit.md`：

```markdown
---
description: Stage and commit using plugin tools
agent: build
---

Follow this workflow using plugin tools only:

1. `myStatus` — check changes
2. `myDiff` staged:false — review diff
3. `myCommit` with conventional message

If $ARGUMENTS is provided, use it as the commit subject.
```

使用方式：在 TUI 輸入 `/my-commit fix login bug`。

**Frontmatter 常用欄位：**

| 欄位 | 說明 |
|------|------|
| `description` | TUI 中顯示的說明 |
| `agent` | 指定 agent（如 `build`） |
| `model` | 覆寫模型 |
| `subtask` | 是否強制 subagent |

**Prompt 進階語法：**

- `$ARGUMENTS` — 使用者輸入的全部參數
- `$1`, `$2` — 位置參數
- `@path/to/file` — 嵌入檔案內容
- `` !`git log -5` `` — 嵌入 shell 輸出

### Step 7：安裝腳本

參考 `scripts/install-global.mjs`，安裝時要做四件事：

1. 複製 `src/index.ts` → `~/.config/opencode/plugins/<name>.ts`
2. 複製 `commands/*.md` → `~/.config/opencode/commands/`
3. 確保 `~/.config/opencode/package.json` 有 `@opencode-ai/plugin`
4. 在 `opencode.jsonc` 的 `plugin` 陣列註冊路徑

Windows 路徑需轉成 OpenCode 可讀格式（本專案 `toConfigPath()` 會處理）。

安裝後 **必須重啟 OpenCode**。

### Step 8：驗證

```bash
# CLI 驗證 tool 是否可用
opencode run "call gitStatus and show the result"

# TUI 驗證 slash command
/git-status
```

確認 AI 日誌中出現 plugin 載入訊息，且實際呼叫的是 `gitStatus` 而非 `bash git status`。

---

## 4. 本專案實作重點解析

### 4.1 為什麼 commit 要用檔案而不是 `-m`

問題（見專案截圖案例）：

- AI 跑 `git commit -m "超長多行訊息..."` 會把整段文字印在終端機
- 與 AI Thought 輸出、CRLF 警告混在一起，畫面難以閱讀

解法（`gitCommit` tool）：

```typescript
const msgPath = join(tmpdir(), `oc-git-commit-${Date.now()}.txt`);
await writeFile(msgPath, message, "utf8");
await $`git -c advice.convertCRLF=false -C ${directory} commit -F ${msgPath} -q`;
```

然後只回傳精簡摘要：

```
Committed abc1234 on main
refactor(codec): unify CausalConvNet
3 files changed, 45 insertions(+), 12 deletions(-)
```

### 4.2 過濾 Git 雜訊輸出

Windows 上常見 CRLF 警告：

```
warning: in the working copy of 'README.md', LF will be replaced by CRLF...
```

處理方式：

1. **源頭抑制**：`-c advice.convertCRLF=false`
2. **輸出過濾**：`sanitizeGitOutput()` 移除 warning 行

> 注意：在 Bun/OpenCode 的 `$` template 中，不要把
> `"-c advice.convertCRLF=false"` 做成一個字串再插值。插值會被視為單一
> argv，Git 會報 `unknown option: -c advice.convertCRLF=false`。請保持
> `git -c ${configValue} ...` 或 `git -c advice.convertCRLF=false ...` 的 token
> 順序。

```typescript
function sanitizeGitOutput(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^warning: in the working copy of /i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

### 4.3 引導 AI 的完整三層防線

| 層級 | 機制 | 作用時機 |
|------|------|----------|
| 1 | `config.instructions` | 每次 session 全域 |
| 2 | `experimental.chat.messages.transform` | 第一則 user message |
| 3 | `experimental.session.compacting` | Context 被壓縮後 |
| 4 | Slash commands | 使用者明確觸發流程 |

### 4.4 Git 工具一覽

| Tool | 取代的 bash | 說明 |
|------|-------------|------|
| `gitStatus` | `git status` | 過濾 CRLF 警告 |
| `gitDiff` | `git diff` | 支援 staged / ref |
| `gitLog` | `git log` | 精簡歷史 |
| `gitTree` | `git log --graph` | 分支拓撲 |
| `gitBranch` | `git branch/checkout` | list / create / switch |
| `gitCommit` | `git add && git commit` | 安靜提交 + 精簡回傳 |
| `gitStash` | `git stash` | push / pop / list / drop |
| `gitPrecommitReview` | 手動看 diff | 提交前審查 |

建議工作流程：

```
gitStatus → gitDiff(staged:true) → gitPrecommitReview → gitCommit
```

---

## 5. Tool 參數 Schema 速查

`tool.schema` 即 Zod，常用型別：

```typescript
args: {
  // 必填字串
  message: tool.schema.string().describe("Commit message"),

  // 可選布林，有預設值
  staged: tool.schema.boolean().optional().default(false),

  // 數字
  count: tool.schema.number().optional().default(10),

  // 列舉
  action: tool.schema.enum(["list", "create", "delete"]).default("list"),

  // 字串陣列
  files: tool.schema.array(tool.schema.string()).optional(),
}
```

---

## 6. 用 Bun `$` 執行 Shell 的注意事項

```typescript
// 指定 git 工作目錄
await $`git -C ${directory} status`.text();

// 帶 git config 旗標（抑制警告）
await $`git -c advice.convertCRLF=false -C ${directory} add -A`;

// 安靜模式
await $`git -C ${directory} commit -F ${msgPath} -q`;

// 取 stdout 文字
const output = (await $`git -C ${directory} diff --cached`.text()).trim();
```

**避免：**

- 把超長文字直接放進 template literal 當 `-m` 參數
- 回傳未處理的 stderr 警告
- 在 plugin 裡用 `console.log`（改用 `client.app.log`）

---

## 7. 兩種部署模式比較

### 模式 A：全域安裝（本專案預設）

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

- 所有專案都能用
- 適合 Git 這類通用工具

### 模式 B：專案內安裝

把檔案放到專案的 `.opencode/`：

```
your-project/
└── .opencode/
    ├── package.json          # 需含 @opencode-ai/plugin
    ├── plugins/
    │   └── my-plugin.ts
    └── commands/
        └── my-command.md
```

- 只在本專案生效
- 適合專案特定工具（內部 API、部署腳本等）

### 模式 C：發佈到 npm

`opencode.jsonc`：

```jsonc
{
  "plugin": ["my-opencode-plugin"]
}
```

OpenCode 啟動時會用 Bun 自動安裝 npm plugin。

---

## 8. 可選：Git Hook 整合

本專案提供 pre-commit hook，在 `git commit` 前呼叫 OpenCode tool：

`hooks/pre-commit`：

```sh
opencode run gitPrecommitReview || echo "AI Review skipped"
```

安裝到目前專案：

```bash
node scripts/install-git-hooks.mjs
# 或
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Hooks
```

這讓 **人類手動 commit** 時也能觸發 AI 審查；與 plugin tool 互補。

---

## 9. 新增 Tool 的檢查清單

新增一個 tool 時，依序確認：

- [ ] `description` 說明用途，並註明「優先於 bash」
- [ ] `args` 每個欄位有 `.describe()`
- [ ] `execute` 回傳精簡、結構化文字
- [ ] 長輸入用檔案 / API，不塞進 shell 一行指令
- [ ] 外部指令錯誤有被 try/catch 或向上拋出
- [ ] 輸出經過雜訊過濾（如 CRLF warning）
- [ ] `GIT_TOOLS_GUIDANCE` / compaction context 有提到新 tool
- [ ] 視需要新增 `commands/xxx.md`
- [ ] 重新安裝 plugin 並重啟 OpenCode
- [ ] 用 `opencode run` 或 slash command 驗證

---

## 10. 常見問題

### Q：AI 還是跑 bash，不用我的 tool？

1. 確認 plugin 已安裝且出現在 `opencode.jsonc`
2. 重啟 OpenCode
3. 加強 `experimental.chat.messages.transform` 指引
4. 用 slash command 明確指定流程
5. 在 `description` 寫「prefer over bash」

### Q：Plugin 載入失敗？

檢查：

```bash
# 依賴是否存在
ls ~/.config/opencode/node_modules/@opencode-ai/plugin

# 手動安裝
npm install --prefix ~/.config/opencode @opencode-ai/plugin
```

### Q：Windows 路徑問題？

`opencode.jsonc` 的 plugin 路徑建議用 `toConfigPath()` 轉換後寫入，或用手動格式：

```
/c/Users/you/.config/opencode/plugins/opencode-git-tools.ts
```

### Q：Tool 與獨立 `.opencode/tools/` 可以並存嗎？

可以。Plugin tools 和獨立 tool 檔都會載入。Plugin 適合多 tool + hook；獨立檔適合單一簡單功能。

### Q：如何讓終端機畫面更整齊？

1. 用 plugin tool 取代 bash
2. 外部指令加 `-q`（quiet）
3. 過濾 warning 行
4. 回傳摘要而非 raw output
5. Commit message 用 `-F` 檔案，不用 `-m` 長字串

---

## 11. 最小可運作範本

複製以下檔案即可開始一個新 plugin：

**src/index.ts**

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";

const GUIDANCE = `<DEMO_PLUGIN>
You have demoStatus and demoEcho tools. Do not use bash equivalents.
</DEMO_PLUGIN>`;

export const DemoPlugin: Plugin = async ({ client, directory, $ }) => {
  await client.app.log({
    body: { service: "demo-plugin", level: "info", message: "loaded" },
  });

  return {
    config: async (config) => {
      config.instructions = config.instructions ?? [];
      config.instructions.push("demo-plugin: use demo* tools");
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      const firstUser = output.messages.find((m) => m.info.role === "user");
      if (!firstUser?.parts.length) return;
      if (firstUser.parts.some((p) => p.type === "text" && p.text.includes("<DEMO_PLUGIN>"))) return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: "text", text: GUIDANCE });
    },

    tool: {
      demoEcho: tool({
        description: "Echo text (prefer over bash echo)",
        args: {
          text: tool.schema.string().describe("Text to echo"),
        },
        async execute(args) {
          return `Echo: ${args.text}`;
        },
      }),

      demoStatus: tool({
        description: "Show current directory",
        args: {},
        async execute() {
          return `Working directory: ${directory}`;
        },
      }),
    },
  };
};

export default DemoPlugin;
```

**commands/demo-echo.md**

```markdown
---
description: Echo text using demoEcho tool
agent: build
---

Call `demoEcho` with text: $ARGUMENTS

Do not use bash echo.
```

---

## 12. 延伸閱讀

- 本專案原始碼：`src/index.ts`
- 安裝腳本：`scripts/install-global.mjs`
- 設定範例：`opencode.json.example`
- Slash command 範例：`commands/git-commit.md`

若要擴充本專案，建議流程：

1. 在 `src/index.ts` 的 `tool` 區塊新增 tool
2. 更新 `GIT_TOOLS_GUIDANCE` 與 compaction context
3. 視需要新增 `commands/*.md`
4. 執行 `install.ps1` 或 `install.sh`
5. 重啟 OpenCode 並驗證
