---
type: meta
---

# Hauck Marketing Vault

Memory backend for the agents in the Hauck Marketing Lab app (Aurelius, Stratos, Vortex, Nexus, Zenith).

## Layout

- `About/` — info about Jake and the agency. Injected into every chat.
- `Clients/<Name>/` — per-client folder. `Profile.md` is form-filled at onboarding. `Memory.md` is append-only facts. `Drive Index.md` is auto-generated.
- `Knowledge/` — general frameworks (TFC notes). Retrieved by tag/agent match.
- `Retros/` — post-campaign retros and learnings.

## How agents see this

Every chat prompt includes:
1. `About/Jake.md` + `About/Hauck Marketing.md`
2. The active client's `Profile.md` + `Memory.md`
3. Matching knowledge notes (by frontmatter `client`, `agent`, `tags`)

## Frontmatter conventions

- `type:` profile | memory | knowledge | about | retro | meta
- `client:` slug or `all`
- `agent:` aurelius | stratos | vortex | nexus | zenith | `all`
- `tags:` YAML list

Open this folder as a vault in Obsidian for editing on Mac/Windows/mobile.
