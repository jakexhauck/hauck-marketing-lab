# Handoff — Step 6: "Save to memory" chat action

You are continuing the Hauck Marketing Lab build. The vault, the Rust `vault.rs` module, prompt injection of About/Client notes, and (likely) the About Jake form (step 4) and New Client form (step 5) are done.

Read these memory files first:
- `MEMORY.md` (index)
- `project_obsidian_vault.md` (vault layout, esp. the rule that memory writes are **explicit user-confirmed**, never auto-extracted by the agent)

## Goal

Give Jake a way, mid-chat, to commit a fact to the active client's `vault/Clients/<Name>/Memory.md`. Two entry points:

1. **Button on agent turns** — a small "Save to memory" action on each agent response. Click → small dialog with the response text pre-filled (editable) → confirm → appends `- YYYY-MM-DD — <fact>` to Memory.md.
2. **Slash command in chat input** — typing `/remember <fact>` and hitting Enter does NOT call the LLM; it appends to Memory.md and shows a confirmation toast.

The point is: memory is built by Jake, not by the agent inferring. Manual control, always.

## Context already in place

**Tauri command available:**
- `api.appendToMemory(root, clientSlug, fact)` → appends `- YYYY-MM-DD — <fact>` to `vault/Clients/<Name>/Memory.md`. **Auto-seeds the file if it doesn't exist**, so you don't need to check first.

The Rust function inserts the new bullet:
1. Above the `<!-- Add new facts above this line. -->` marker if present, OR
2. After the `## Facts` heading, OR
3. At the end of the file.

So the inserted bullet appears at the top of the facts list (most recent first).

**Existing ChatDrawer:** `app/src/components/ChatDrawer.tsx` — already imports `api` and has access to `clientSlug` (added in step 3). Turn rendering is somewhere in this file or a helper component.

## What to build

### Part A — button on agent turns

In `ChatDrawer.tsx`, find where each turn in `visibleTurns` is rendered. For each `turn` with `role === "agent"` (and not the streaming placeholder), add a small action button (e.g., a 💾 icon or a text link "Save to memory" — match existing styling). Position: top-right corner of the turn, or in a small action row beneath it.

On click:
1. Open a modal/popover with:
   - A textarea pre-filled with the agent's response **trimmed to the first ~280 chars** (give Jake a starting point; he edits it down to a clean fact). Or pre-fill with empty + a placeholder "What's the fact to remember?". Designer's choice — I lean toward pre-filling because it saves typing.
   - "Cancel" and "Save to memory" buttons.
2. On "Save to memory": call `api.appendToMemory(root, clientSlug, fact.trim())`, close modal, show a small confirmation toast/banner like "Saved to Willis Windows memory."
3. Handle errors: if the call rejects, display the error inline in the modal and keep it open.

### Part B — slash command

In the input submit handler (the `submit` function in `ChatDrawer.tsx`), before doing anything else with the input value:

```typescript
const value = input.trim();
if (value.startsWith("/remember ")) {
  const fact = value.slice("/remember ".length).trim();
  if (!fact) {
    setError("Usage: /remember <fact>");
    return;
  }
  try {
    await api.appendToMemory(root, clientSlug, fact);
    setInput("");
    // Show a transient confirmation in the chat thread:
    //   either a "system" turn (not from agent, not from user), or a toast
    setToast(`Remembered: ${fact}`);  // implement setToast similar to existing error UI
  } catch (e) {
    setError(String(e));
  }
  return;  // do NOT call Claude
}
```

Also add a help affordance: if Jake types `/remember` alone (no args), show usage. If he types `/?` or `/help`, list available commands.

### Optional polish (only if time)

- Show the most recent 3-5 memory entries at the top of the chat as a collapsible "Memory" pill. Pulls from `api.readClientNotes` filtered to `front.type === "memory"`.
- Highlight in the message thread when something gets saved (a small inline "remembered" badge on the saved turn).

## Out of scope

- Do **not** have the agent auto-extract facts. Explicit user save only. This is a hard architectural rule (see [[project_obsidian_vault]]).
- Do **not** edit or delete existing memory entries via the chat UI. Editing memory is for Obsidian directly. (We could build an in-app memory editor later as a separate task.)
- Do **not** add memory injection logic — `prompt.ts` already reads Memory.md via `readClientNotes`. The fact you just saved becomes visible to the next agent turn automatically.
- Do **not** archive or compact memory in this step. The "cap + curate" rule (see vault memory) is a future task.

## Acceptance criteria

1. Each agent turn in the chat thread shows a "Save to memory" affordance.
2. Clicking it opens a dialog with the response text editable, and Save writes a new bullet to `vault/Clients/<Name>/Memory.md`.
3. The bullet appears at the top of the `## Facts` section with today's date.
4. Typing `/remember <fact>` in the input + Enter writes the bullet immediately, clears the input, and does NOT call the LLM.
5. After saving, the next agent turn (in the same chat) sees the new fact — verify by asking the agent "What do you know about this client?" and confirming the saved fact appears.
6. Errors (e.g., empty fact, network) surface to the user; the dialog stays open if it failed.
7. `pnpm tsc --noEmit` passes from `app/` with no new errors.

## Test plan

1. `pnpm tauri dev` from `app/`.
2. Open a chat with Aurelius, active client = Willis Windows.
3. Ask: "What times of year do window cleaning ads perform best?". Get a response.
4. Click "Save to memory" on the response. Edit the textarea down to one clean sentence. Save.
5. Open `vault/Clients/Willis Windows/Memory.md` directly. Confirm bullet at top of facts list with today's date.
6. Send a new message: "What do you remember about Willis?". The agent's response should reference the saved fact.
7. In the input, type `/remember Owner prefers calls on Tuesdays`. Hit Enter. Confirm:
   - Input clears
   - No agent turn was created
   - Memory.md has the new bullet
   - A confirmation toast appears
8. Type `/remember ` (with empty arg). Confirm usage error appears.

## Files you will likely touch

- `app/src/components/ChatDrawer.tsx` — add button rendering, slash-command handling, modal logic
- Possibly a new `app/src/components/SaveToMemoryDialog.tsx` if the modal is complex enough to warrant its own file
- `app/src/index.css` or co-located CSS for the button + modal styles

## Do not touch

- `vault.rs` — `append_to_memory` is already exactly what you need, including auto-seeding
- `prompt.ts` — Memory.md is already injected via `readClientNotes`
- The Memory.md file's frontmatter or structure — `append_to_memory` is the only writer; let it own the format

## When you're done

If you implement the slash command differently (e.g., a different prefix, or no slash command at all), note it. Otherwise no memory update needed — this step doesn't introduce new architectural decisions.

Report back: files touched, a brief description of the UI, and confirmation of the test plan.
