---
description: Stage, review, and commit changes using git plugin tools
agent: build
---

Follow this workflow using plugin tools only:

1. `gitStatus` — see what changed
2. `gitDiff` with staged:false — review unstaged diff
3. Stage only relevant files via `gitCommit` files argument (not `git add` bash)
4. `gitPrecommitReview` — review staged diff
5. `gitCommit` with a conventional commit message

Message format: `type: description` (feat, fix, refactor, docs, test, chore).

If $ARGUMENTS is provided, use it as the commit message subject.