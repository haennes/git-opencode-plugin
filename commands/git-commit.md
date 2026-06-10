---
description: Stage, review, and commit changes using git plugin tools
agent: build
---

Follow this workflow using plugin tools only (never bash `git commit`):

1. `gitStatus` — see what changed
2. `gitDiff` with staged:false — review unstaged diff
3. Stage only relevant files via `gitCommit` files argument (not `git add` bash)
4. `gitPrecommitReview` — review staged diff
5. `gitCommit` with a conventional commit message

Message format: `type: description` (feat, fix, refactor, docs, test, chore).

Keep the subject line ≤72 characters. Put longer details in the message body (blank line, then paragraphs). Do not paste bullet lists into a shell `-m` string — `gitCommit` writes the message via file and returns a short summary.

If $ARGUMENTS is provided, use it as the commit message subject.