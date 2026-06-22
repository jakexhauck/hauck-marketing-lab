---
name: skill-creator
description: Use when the user wants to create, design, scaffold, or improve a Claude Code Agent Skill — triggers like "create a skill", "make a skill", "write a skill for X", "new SKILL.md", "improve this skill", or "skill that does Y". Provides the official frontmatter spec, description-writing rules, progressive-disclosure layout, naming and placement guidance, anti-patterns to avoid, and a copy-pasteable SKILL.md template so authored skills trigger reliably and stay concise.
---

# skill-creator

This skill teaches Claude how to author Claude Code Agent Skills that trigger reliably, stay concise, and follow Anthropic's official conventions. Apply it whenever the user asks to create, scaffold, or improve a skill.

## When to Use This Skill

Use this skill when the user:

- Says "create a skill", "make a skill", "write a skill for X", "scaffold a skill", "new SKILL.md".
- Asks to improve, audit, or rewrite an existing `SKILL.md`.
- Describes a recurring workflow they want Claude to follow ("every time I X, do Y") and a skill is the right shape for it.
- Pastes skill frontmatter and asks why it isn't triggering.

Do **not** use this skill for general agentic-coding advice, for editing CLAUDE.md, or for installing skills (use `find-skills` for installs).

## Skill vs. Other Mechanisms

Pick the right tool before writing anything. The most common authoring mistake is reaching for a skill when something simpler fits.

| If the need is… | Use this instead of a skill |
|---|---|
| Persistent project facts, conventions, build commands | `CLAUDE.md` |
| One-shot research that would bloat context | A subagent (`Agent` tool) |
| Personal preference that applies in every conversation | `~/.claude/CLAUDE.md` or auto-memory |
| A one-off task that won't recur | Just do the task |

Create a skill when there is a **repeatable workflow or domain procedure** that Claude should apply *conditionally* — only when triggered by relevant user requests — and that would be wasteful to keep loaded all the time.

## Anatomy at a Glance

```
<skill-name>/
├── SKILL.md              # required, uppercase filename
├── reference.md          # optional, long lookup material loaded on demand
├── examples/             # optional, sample inputs/outputs
│   └── sample.md
├── templates/            # optional, copy-pasteable scaffolds
└── scripts/              # optional, executables invoked via ${CLAUDE_SKILL_DIR}
    └── helper.py
```

Three scopes, in precedence order (personal wins ties):

| Scope | Path on this machine | When to use |
|---|---|---|
| Personal | `C:\Users\games\.claude\skills\<name>\SKILL.md` | Cross-project guidance, personal workflows |
| Project | `<project>\.claude\skills\<name>\SKILL.md` | Conventions specific to one repo |
| Plugin | `<plugin>\skills\<name>\SKILL.md` | Bundled with a distributed plugin (namespaced as `plugin:name`) |

Filename **must** be `SKILL.md` (uppercase). Directory name is kebab-case and becomes the slash-command name.

## Frontmatter Spec

```yaml
---
name: <kebab-case, ≤64 chars, matches directory>
description: <what the skill does + when to use it. Required-in-practice.>
when_to_use: <optional extra trigger context, appended to description>
allowed-tools: <optional, space-separated or YAML list — pre-approves tools>
disable-model-invocation: false   # set true if only the user should invoke
user-invocable: true              # set false for background-knowledge-only skills
license: <optional>
---
```

**Critical limit:** `description` + `when_to_use` are concatenated and **truncated at 1,536 characters** in the listing Claude sees. Anything past that is invisible to the trigger system. Lead with the use case; put icing at the end.

**Never** combine `disable-model-invocation: true` with `user-invocable: false` — that makes the skill unreachable.

## Writing the Description (Highest-Leverage Section)

The description is the *only* signal Claude uses to decide whether to load the skill. Get this right and the rest of the skill matters; get it wrong and the body is dead weight.

Rules:

1. **Lead with the use case.** Truncation cuts the tail.
2. **Pack natural trigger phrases**, ideally in quotes — words and forms users actually type.
3. **Be pushy.** Undertriggering is the dominant failure mode. If the description sounds modest, it won't fire.
4. **Describe *what* and *when*, not *how*.** Implementation belongs in the body.
5. **Be specific.** "Helpful for various tasks" triggers nothing.

### Good vs. Bad

❌ **Bad** — vague, no triggers, describes mechanism not use:
> "A skill for working with git. Uses the gh CLI under the hood and supports many workflows."

✅ **Good** — leads with use, packs triggers, names the user's words:
> "Use when the user asks to summarize uncommitted changes, draft a commit message, or review their diff — phrases like 'what changed', 'write a commit message', 'review my changes'. Flags risky edits (deletions, secrets, schema changes) before suggesting a message."

❌ **Bad** — describes implementation:
> "Runs `npm test` and parses the output to find failures."

✅ **Good** — describes the trigger and the value:
> "Use when the user asks 'why is this test failing', 'fix the failing tests', or pastes a Jest/Vitest failure. Reproduces the failure locally, isolates the cause, and proposes a minimal fix."

## Body Content Rules

- **Lead with a `## When to Use This Skill` section.** First thing after the H1.
- **Cap at 500 lines.** Every line is a recurring token cost once loaded.
- **Use H2 sections** for navigation. Bold call-outs for must-not-violate rules.
- **Embed runnable examples** (commands, code blocks) — they're worth far more than prose.
- **Write a `## Gotchas` section** if the domain has any non-obvious traps. This is the single highest-value content per Anthropic's best-practices guidance: it documents mistakes Claude actually makes that the rest of the doc wouldn't catch.
- **Push only what changes default behavior.** Don't restate things Claude already does well.

## Progressive Disclosure: When to Split Into Multiple Files

`SKILL.md` is loaded *whenever the skill triggers*. Anything bulky that isn't always needed should live in a sibling file and be referenced from `SKILL.md` so Claude pulls it on demand.

Split out when you have:

- **Long reference tables, API specs, config schemas** → `reference.md`
- **Full sample outputs** → `examples/<name>.md`
- **Copy-pasteable scaffolds longer than ~50 lines** → `templates/<name>.md`
- **Executable helpers** → `scripts/<name>.{py,sh,ps1}`, called via `${CLAUDE_SKILL_DIR}/scripts/...` so paths work regardless of CWD

Reference them with relative markdown links: `[full spec](reference.md)`. That sentence is the cue Claude uses to decide whether to load the file.

Single-file is fine — and preferable — for skills under ~250 lines. Don't split prematurely.

## Naming & Placement

- Directory and `name:` field: lowercase, kebab-case, ≤64 chars, no spaces or special chars (e.g. `commit-helper`, not `Commit_Helper` or `commit helper`).
- Directory name becomes the `/slash-command`, so pick something the user would type.
- Personal skills: `C:\Users\games\.claude\skills\<name>\` — available everywhere.
- Project skills: `<project-root>\.claude\skills\<name>\` — only active in that repo.
- Verify with `/skills` after creating: it should appear in the list with its description.

## Anti-Patterns

- **Generic descriptions** ("useful skill for various tasks"). Auto-invocation will silently never fire.
- **Dumping full API specs or long manuals into `SKILL.md`.** Move to `reference.md` and link.
- **Creating a skill for a one-off task.** If you won't use it again, don't pay the authoring + load cost.
- **Describing *how* in the description.** Mechanism details belong in the body.
- **Restating Claude's defaults.** "Be helpful and clear" wastes tokens.
- **Mixing `disable-model-invocation: true` with `user-invocable: false`.** Skill becomes unreachable.
- **Embedding the skill's reasoning out loud** ("First I think about X, then I…"). Write rules and procedures, not narration.
- **Files named `skill.md` or `Skill.md`.** Must be `SKILL.md` exactly.
- **Skipping the `## When to Use` section.** Without it the body has no anchor.

## Authoring Workflow

Follow these steps every time the user asks to create a skill:

1. **Confirm scope.** Ask personal vs. project unless the user already specified.
2. **Pick a kebab-case name.** Verify it isn't taken — check the directory and `/skills`.
3. **Draft the description first.** Before any body content. Stress-test it: do the trigger phrases match how the *user* phrased the original request? If not, revise.
4. **Outline body sections.** First H2 must be `## When to Use This Skill`. Add `## Gotchas` if the domain has traps.
5. **Decide single-file vs. supporting files** based on size and reuse. Default single-file under ~250 lines.
6. **Write the file** at the correct path. Use exact `SKILL.md` casing.
7. **Self-verify.** Re-read with one question in mind: *if a user said "<one of the trigger phrases>", would Claude load this skill?* If not, the description needs rework.

## Gotchas

- The 1,536-char description budget is **shared across `description` + `when_to_use`**. Putting bullet-pointed triggers into `when_to_use` doesn't buy extra room.
- Personal-scope skills override project-scope on name collision — the project skill silently won't load. Pick distinct names if you have both.
- The skill body is not loaded until trigger time, but the `description` is loaded on *every* turn. Keep the description tight.
- Skills are reloaded live in a session when files change — but a fresh `/skills` listing only refreshes when you re-list. Run `/skills` after edits.
- On Windows, paths with spaces (like `C:\Users\games\Desktop\claude code\`) work for project skills, but quote them in any embedded shell examples.
- `allowed-tools` pre-approves tool calls inside this skill. Use sparingly — it widens the trust boundary.

## Embedded Template

Copy this into `<scope>\skills\<name>\SKILL.md` and edit:

```markdown
---
name: <kebab-case-name>
description: Use when the user <does X, asks Y, says "Z"> — triggers like "<phrase 1>", "<phrase 2>", "<phrase 3>". <One sentence on what value the skill provides.>
---

# <Skill Name>

<One-sentence elevator pitch.>

## When to Use This Skill

Use this skill when the user:

- <Concrete trigger 1>
- <Concrete trigger 2>
- <Concrete trigger 3>

Do **not** use it for <closest-adjacent thing it might be confused with>.

## How to <Verb the User Cares About>

1. <Step 1, with the exact tool/command if any>
2. <Step 2>
3. <Step 3>

## Examples

<Concrete input/output pairs or runnable command snippets.>

## Gotchas

- <Non-obvious trap 1>
- <Non-obvious trap 2>
```

## Official References

- Skills overview & spec: https://code.claude.com/docs/en/skills
- Best practices: https://code.claude.com/docs/en/best-practices
- Anthropic skills repo: https://github.com/anthropics/skills
