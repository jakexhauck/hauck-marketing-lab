# What Jake needs to get done

Running list of action items left over from shipped build plans. Each section is dated by ship; items are Jake-only actions (configuration, tuning, content authoring) the agent could not do.

## 08 · Niche Playbooks (shipped 2026-05-18)

The niche playbook framework is live. Three starter playbooks ship: `dental`, `gym-fitness`, `med-spa`.

**What's in the app now:**

- `vault/Playbooks/<slug>/` directory layout with six required files per niche (`audience.md`, `offers.md`, `angles.md`, `creative-brief.md`, `competitors.md`, `benchmarks.json`). README at `vault/Playbooks/README.md` documents the shape.
- `niche` field on client `Profile.md` frontmatter. Picker dropdown on the new-client flow (Manage clients → + Add client) and editable in the Edit Profile screen. Options come from directories under `vault/Playbooks/` plus a "Custom (no playbook)" sentinel.
- Form prefill plumbing in `GenericFormGenerator` honours: explicit override > Profile.md > niche playbook > empty. Three forms wired today: Hooks, Creative Brief, Ad Copy. Each prefilled field shows a small `auto · profile` or `auto · <slug> playbook` tag.
- Validation at app start: any incomplete playbook directory logs a console warning, never blocks boot.
- **Niche Playbooks page** under Workspace in the sidebar. Lists every playbook with a complete/incomplete badge, supports Add (with kebab-case slug + display name + the six content fields including a structured benchmarks form), Edit, and Delete (with confirm). All writes go through Tauri commands; no browser fs.

**Jake's action items:**

1. **Set `niche:` on the existing Willis Windows client.** Open Workspace → Clients Hub → Edit profile, pick a niche from the dropdown (or leave Custom if none fit), save. The home-services niche is not yet authored, so most fits will be "Custom" for now.
2. **Tune the three starter playbooks.** The agent authored drafts from generic Hauck Marketing knowledge. Open the Niche Playbooks page and edit each one to reflect real past-client experience: which offers actually performed, which angles got the cheapest CPLs, what the benchmark targets really are based on your data.
3. **Author the next niche.** Home services is the obvious gap given Willis Windows is currently in the book. Use the in-app Add niche modal. ~2 hours per niche of content writing once the framework is in place.
4. **Wire more forms to playbook prefill (optional).** Today: Hooks, Creative Brief, Ad Copy. Candidates for expansion: Offer + CTA, Competitor Research, Audience Research. One-line addition per form in `app/src/lib/formConfigs.ts` (`prefillFromPlaybook`).

**What's parked (not in this build):**

- **Reverse-flow capture.** Phase 2 in the original plan. When Jake makes the same non-obvious edit to a niche default across 3+ clients, surface a Morning Briefing prompt: "Update the dental playbook with this?" Not built yet.
- **Multi-niche clients.** One niche per client, by design. If a client truly straddles, pick the dominant niche.
- **Auto-generating playbooks from past client folders.** Manual authoring only for v1.
- **Playbook versioning beyond git.** Git history is the version log.
- **Per-niche benchmarks auto-applied to the Ads Manager.** The benchmark JSON lives in the playbook but the Ads dashboard still reads from the per-client `benchmarks` field on `clients.yaml`. Wiring playbook benchmarks into the dashboard as a fallback is a small follow-up.
