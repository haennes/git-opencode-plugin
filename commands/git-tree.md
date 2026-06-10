---
description: Show git commit tree graph using the gitTree plugin tool
agent: build
---

Run `gitTree` and summarize:
- branch topology and merge points
- current HEAD and remote tracking branches
- recent commit flow

Use `all: true` when you need every branch; use `ref` to anchor from a specific branch or commit.

Do not use raw `git log --graph` bash when the gitTree tool is available.