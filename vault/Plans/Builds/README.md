# Builds (Hermes build pipeline)

This folder is the source of truth for the admin **Build Lab** status board.

Each `.md` file here is one build, filed by Hermes from Jake's idea. The board at
`/admin` (Build Lab) reads this folder over the GitHub API and renders four
columns by frontmatter `status`.

Frontmatter every build file must have:

```yaml
---
type: plan
title: "Short title"
status: idea        # idea | building | ready | done
kind: feature       # feature | backend | landing | static | bugfix | new-project
issue: 0            # GitHub issue number once filed
created: "<ISO timestamp>"
---
```

Status ownership: Hermes sets `idea`; the builder moves it `building` -> `ready`
-> `done`. This README has no frontmatter, so the board ignores it.
