# New machine setup (Mac sync)

What `git pull` gives you, and what you have to install by hand. Plugins and most
skills live in the global `~/.claude/` folder, NOT in this repo, so they do not
travel with a pull.

## 1. Comes down automatically with `git pull`

Nothing to do for these. Pulling the repo gets you:

- All `CLAUDE.md` files (root + `copywriter/`, `data-analyst/`, `web-designer/`)
- `.claude/settings.json` (shared settings)
- **All skills**, now vendored into `.claude/skills/` and `.agents/skills/`:
  composio, copywriter, data-analyst, emil-design-eng, impeccable, review-animations,
  skill-creator, taste-skill, thellc-design, trigger-dev, ui-ux-pro-max, watch,
  web-designer. These load for this project automatically, no install needed.
- All app code and subprojects (`command-center/`, `gohighlevel-cli/`, `intranet/`, etc.)

> Note: these skills are project-scoped here. If you want them available in
> *other* projects on the Mac too, also copy them into the global `~/.claude/skills/`.

## 2. Install by hand on the Mac

### Plugins (via Claude Code) — the only manual step

Marketplace: `anthropics/claude-plugins-official`. In Claude Code run `/plugin`, add
the marketplace if needed, then install:

- `superpowers` (was on `6.0.3`) — brainstorming, writing-plans, TDD, debugging, etc.
- `rust-analyzer-lsp` (was on `1.0.0`)

Plugins live in the global `~/.claude/plugins/` and do not travel with the repo.

## 3. Not synced on purpose

- `.claude/settings.local.json` — machine-local settings, gitignored by design.
- `.claude/worktrees/` — throwaway git worktrees, gitignored.

## Quick check after setup

In Claude Code, confirm the plugins and skills show up in the available list, then
open this repo and confirm `/impeccable` and the `superpowers:*` skills resolve.
