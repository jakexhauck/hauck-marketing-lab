# Install Claude Code and AI Agents

**Category:** Stack
**Source:** Module 5 Lesson 2, Module 5 Lesson 4
**When to use:** One-time setup. Run before any other tool installs.
**Estimated time:** 30 to 45 min

---

## Prerequisites

- [ ] Computer with internet
- [ ] Anthropic account (or willing to create one)
- [ ] $20/month for Claude Pro plan

## Checklist

- [ ] **Install VS Code:**
  - [ ] Go to code.visualstudio.com
  - [ ] Click the blue download button (auto-detects OS)
  - [ ] Mac: open file and drag to Applications. Windows: run installer.
  - [ ] Launch. Dark welcome screen is normal.
- [ ] **(Windows only) Install Git Bash:**
  - [ ] Go to gitforwindows.org
  - [ ] Run installer, accept defaults
- [ ] **Install Claude Code extension:**
  - [ ] In VS Code sidebar, click the four-squares Extensions icon
  - [ ] Search "Claude Code"
  - [ ] Select the one verified by Anthropic (checkmark)
  - [ ] Click Install, wait ~10 seconds
- [ ] **Sign in:**
  - [ ] Press Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac)
  - [ ] Type "Claude: Sign In", select it
  - [ ] Browser opens, log in or create Anthropic account
  - [ ] Pick Pro plan ($20/month)
  - [ ] Return to VS Code, Claude chat panel should appear (if not: View menu, Claude Code)
- [ ] **Create your HQ folder:**
  - [ ] File, Open Folder
  - [ ] Create new Desktop folder (no spaces, use dashes)
  - [ ] Examples: `the-brain`, `hq`, `command-center`
- [ ] **Pick agent personality:**
  - [ ] J.A.R.V.I.S. (calm, precise, addresses you as Sir)
  - [ ] HARVEY (confident, sharp, unfiltered closer)
  - [ ] ALFRED (patient, wise, explains reasoning)
  - [ ] F.R.I.D.A.Y. (fast, minimal, answer-first)
  - [ ] DONNA (sharp, organized, light sarcasm)
  - [ ] Or build your own
- [ ] **Create CLAUDE.md:**
  - [ ] Right-click in left file panel, New File
  - [ ] Name it exactly `CLAUDE.md`
  - [ ] Paste personality template
  - [ ] Fill in: identity, voice rules, who I am, my clients, ad copy rules
  - [ ] Save
- [ ] **Test:**
  - [ ] In Claude chat panel: "Write me 3 Facebook ad headlines for a pizza shop"
  - [ ] Confirm headlines appear
- [ ] **Install AI Agents (Traffic Command pack):**
  - [ ] Drag the unzipped package contents into your workspace
  - [ ] Verify folders exist: `agents/`, `knowledge/`, `skills/`, `commands/`, plus `README.md`
  - [ ] Existing CLAUDE.md is preserved, agents folder adds to it
- [ ] **Test agents:**
  - [ ] Diagnosis (Zenith): "My CPM is $45 and CTR is 0.6%, what is wrong?"
  - [ ] Creative (Vortex): "Write me 10 Facebook ad hooks for a dentist in Miami"
  - [ ] Strategy (Stratos): "My client is a gym owner with $2K/month ad budget. Build me a campaign plan."

## Notes

- If Claude not responding: close and reopen VS Code (fixes ~90% of issues).
- If extension not found: search inside the Extensions panel (four squares icon), not the regular VS Code search bar.
- If sign-in not working: clear browser cookies for anthropic.com, retry.
- The CLAUDE.md file is your agent's knowledge base. It's read at the start of every conversation. Without it, your AI is generic. With it, it's personalized.

## Related SOPs

- meta-api-token-setup
- meta-ads-mcp-install
- ad-copy-12-angle-generation
- daily-15min-optimization-routine
