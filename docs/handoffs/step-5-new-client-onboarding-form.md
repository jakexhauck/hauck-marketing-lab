# Handoff — Step 5: "New client" onboarding form

You are continuing the Hauck Marketing Lab build. The Obsidian vault foundation, the `vault.rs` Tauri module, and prompt-injection of About/Client notes (steps 1-3) are already done. Step 4 (About Jake settings form) may or may not be done — this step is independent of it.

Read these memory files first:
- `MEMORY.md` (index)
- `project_obsidian_vault.md` (vault layout)
- `project_app_foundation.md`

## Goal

When Jake adds a new client to the app, immediately prompt him to fill out a profile form. The form's answers get written to `vault/Clients/<Client Name>/Profile.md`. Once saved, that profile is automatically injected into every chat involving that client (via the existing `prompt.ts` integration).

## Context already in place

**Existing client flow:**
- `app/src/components/ClientsPage.tsx` is where clients are listed and added
- `api.addClient(root, slug, name, driveFolderUrl?)` creates the entry in `data/clients.yaml` and a folder at `data/<slug>/`
- The vault has a pre-seeded `vault/Clients/Willis Windows/Profile.md` with placeholder fields — use it as the schema reference

**Vault note for a client profile, current shape:**
```yaml
---
type: profile
client: <slug>
agent: all
tags: [client, profile]
status: pre-launch | live | paused
---

# <Client Name> — Profile

## Business
<one-line description of what they do>

## Services
<services offered>

## Target customer
<who they serve>

## Offers
<intro offers, packages, seasonal promos>

## Voice / brand notes
<how they want to be talked about>

## What they want us to avoid
<no-gos>

## Geography
<service area, ZIP codes, radius>
```

**Tauri commands available:**
- `api.addClient(root, slug, name, driveFolderUrl?)` — already used; creates the client entry. **Folder path inside the vault is `vault/Clients/<name>/` — note the human name (with spaces), not the slug.**
- `api.writeVaultNote(root, path, front, body)` — writes Profile.md. The Rust side creates parent directories as needed.
- `api.readClientNotes(root, clientSlug)` — reads existing client notes if Jake re-opens the form to edit later.
- `api.readVaultNote(root, path)` — single-note read.

## What to build

### UI flow

**Path A — new client:**
1. Jake clicks "Add client" on `ClientsPage`.
2. The existing slug + name + Drive URL inputs collect the basics. After `api.addClient` succeeds, **automatically** open the Profile form for that client (modal or inline). Don't make it a separate manual step.
3. Profile form is structured (see fields below). Save writes `vault/Clients/<Name>/Profile.md`.
4. After save, return Jake to the clients list with the new client selected.

**Path B — edit existing profile:**
1. From `ClientsPage`, each client row needs an "Edit profile" action (button or link).
2. Loads existing `vault/Clients/<Name>/Profile.md` into the form.
3. Save overwrites.

### Form fields

Structured form, not a freeform markdown textarea (different from step 4 — for clients we want consistency across clients).

| Field | Input | Required | Notes |
|-------|-------|----------|-------|
| Business name | text (readonly, from client entry) | — | shown for context, not editable here |
| What they do | one-line text | yes | becomes the "Business" section content |
| Services | textarea (multi-line, becomes a list) | yes | one service per line |
| Target customer | textarea | yes | free-form |
| Offers | textarea | no | one offer per line |
| Voice / brand notes | textarea | no | free-form |
| What to avoid | textarea | no | one item per line |
| Geography | text | no | "service area / ZIP codes / radius" |

The textareas that are "lists" (Services, Offers, What to avoid) should convert blank-line-separated entries into markdown bullets on save.

### Building the Profile.md body

```typescript
function buildProfileBody(client: ClientEntry, form: ProfileFormValues): string {
  const bulletize = (text: string) =>
    text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `- ${s}`)
      .join("\n");

  return [
    `# ${client.name} — Profile`,
    "",
    "## Business",
    form.business.trim(),
    "",
    "## Services",
    bulletize(form.services),
    "",
    "## Target customer",
    form.target.trim(),
    "",
    "## Offers",
    bulletize(form.offers),
    "",
    "## Voice / brand notes",
    form.voice.trim(),
    "",
    "## What to avoid",
    bulletize(form.avoid),
    "",
    "## Geography",
    form.geography.trim(),
    "",
  ].join("\n");
}
```

### Building the frontmatter

```typescript
const front: NoteFront = {
  type: "profile",
  client: client.slug,
  agent: "all",
  tags: ["client", "profile"],
  status: client.status, // pre-launch | live | paused
};
```

### File path

```typescript
const path = `${root}/vault/Clients/${client.name}/Profile.md`;
```

On Windows the forward slashes are fine — Tauri normalizes them. But if you want to be safe, just join with `/` (the Rust `write_vault_note` handles parent dir creation).

### Loading existing profile (edit path)

Use `api.readClientNotes(root, clientSlug)` and find the note with `front.type === "profile"` (or filename ending in `Profile.md`). Parse the body back into form fields by splitting on `## ` headings — keep this simple, it's the inverse of `buildProfileBody`.

### Re-parsing a markdown body back to form

Use a simple regex-based section splitter. Expected sections are predictable since you wrote them.

```typescript
function parseProfileBody(body: string): ProfileFormValues {
  // Split on /^## (.+)$/m to get section pairs
  // For list sections (Services, Offers, Avoid), strip leading "- "
  // ... straightforward
}
```

### Out of scope

- Do **not** create Memory.md as part of this form. `api.appendToMemory` (used in step 6) auto-seeds it on first use.
- Do **not** create Drive Index.md as part of this form. That's `api.refreshDriveIndex` and is separate.
- Do **not** add file uploads (logos, brand assets). Those live in Google Drive, indexed by Drive Index later.
- Do **not** add a markdown preview — the form is structured, not freeform.

## Acceptance criteria

1. Clicking "Add client" → entering basics → save → Profile form opens immediately.
2. Filling Profile form → save → `vault/Clients/<Name>/Profile.md` exists with the structured body and proper frontmatter.
3. Editing the profile of an existing client loads the current content correctly.
4. Saving updates the file; the body re-parses cleanly on the next open (round-trip works).
5. Open a chat with Aurelius, active client = the new client, ask "Tell me about this client" → response reflects the saved profile content (proves prompt injection is reading the file).
6. `pnpm tsc --noEmit` passes from `app/` with no new errors.

## Test plan

1. `pnpm tauri dev` from `app/`.
2. Add a fake client: slug `test-co`, name `Test Co`, no Drive URL.
3. Profile form opens. Fill all fields with distinctive test strings ("ALPHA business", "BRAVO services line 1\nBRAVO line 2", etc.). Save.
4. Inspect `vault/Clients/Test Co/Profile.md` on disk — confirm structured markdown + frontmatter.
5. Switch active client to Test Co. Open ChatDrawer. Ask "What's the business?". Aurelius should say "ALPHA business" or close.
6. Edit profile, change a value, save, re-open form — confirm the new value loads.
7. Delete the test client (existing flow) — vault folder is left behind, that's fine for v1 (don't auto-delete vault folders, too risky).

## Files you will likely touch

- `app/src/components/ClientsPage.tsx` — add "Edit profile" action, intercept "Add client" success to open profile form
- `app/src/components/ClientProfileForm.tsx` — **new**, the structured form
- `app/src/lib/clientProfile.ts` — **new**, the `buildProfileBody` / `parseProfileBody` helpers (testable, decoupled from UI)
- Maybe `app/src/index.css` or co-located styles

## Do not touch

- `vault.rs` or any other Tauri module — vault writes are handled by `write_vault_note`
- `prompt.ts` — already reads Profile.md via `readClientNotes`
- `data/clients.yaml` directly — always go through `api.addClient`
- The existing seeded `Willis Windows/Profile.md` (treat as a normal client profile that Jake can edit through this form)

## When you're done

If you discover any new convention worth remembering (e.g., how to handle clients with no profile yet), add a small memory file. Otherwise no memory updates.

Report back: files touched, screenshot or description of the form, and confirmation of acceptance criteria.
