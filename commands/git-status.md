---
description: Check git status using the gitStatus plugin tool
agent: build
---

Run `gitStatus` (porcelain if you need machine-readable output) and summarize:
- staged vs unstaged files
- untracked files
- branch and ahead/behind if relevant

Do not use raw `git status` bash when the gitStatus tool is available.