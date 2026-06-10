---
description: Pre-commit review of staged changes
agent: build
---

1. Call `gitPrecommitReview` on staged changes.
2. Report: bugs, missing tests, secrets, scope creep, style issues.
3. Suggest a conventional commit message.
4. Do not commit unless the user explicitly asks.