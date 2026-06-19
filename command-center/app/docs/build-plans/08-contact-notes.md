# 08: Contact & Lead Notes (read/write)

## Objective

Surface the notes attached to a contact (and the opportunity behind a lead) as a readable
list, and let the client add, edit, and delete notes from inside the app. Today notes are
write-only and only as a side effect of marking a lead Won.

## Why it matters

This is the smallest possible "the app writes back to GHL" feature, which makes it the right
first feature after the infrastructure docs (01 to 07). It proves the write path end to end on
a low-risk object: a bad note never loses a lead or mis-sends a message. Once a client can log
"called, left voicemail" against a lead, the app stops being a read-only dashboard and starts
being where they work.

## Dependencies

- None hard. Works on the current single-tenant model.
- Soft: nicer once 04 (real user management) lands so a note can be attributed to the GHL team
  member who wrote it via `userId`. Until then, notes are written without an author.

## Current state

Notes already flow in one direction, one place. `functions/api/leads/[id].ts` posts a note when
a lead is marked Won:

```ts
// functions/api/leads/[id].ts (current, write-only, Won flow only)
const noteBody = `Marked Won. $${body.value}. Via Hauck Dashboard.`;
await ghlFetch(
  { token: t.ghl_token, locationId: t.ghl_location_id },
  `/opportunities/${encodeURIComponent(id)}/notes`,
  { method: "POST", body: JSON.stringify({ body: noteBody }) },
).catch((e) => console.warn("[lead.note]", e));
```

There is no list endpoint, no contact-notes endpoint, and no UI. The lead's single `notes`
string (from `shapeOpportunity`) is the only note-like thing rendered, and it is the
opportunity's free-text field, not the notes collection.

## Target state

A new `functions/api/contacts/[contactId]/notes` resource that lists and creates, plus a
`[noteId]` sub-route for edit and delete, all proxying GHL's contact-notes API. A `<NoteList>`
component rendered on `LeadDetail` (and later the contact detail) showing newest-first notes
with a composer and per-note edit/delete.

GHL endpoints (v2, `services.leadconnectorhq.com`, version `2021-07-28`):

- `GET    /contacts/{contactId}/notes`
- `POST   /contacts/{contactId}/notes`            body `{ body, userId? }`
- `PUT    /contacts/{contactId}/notes/{id}`       body `{ body, userId? }`
- `DELETE /contacts/{contactId}/notes/{id}`

> Decision: key notes off `contactId`, not the opportunity. GHL stores notes on the contact, and
> a lead always carries `contactId` (enriched in `leads/[id].ts`). This means notes follow the
> person across pipelines, which is what a client expects.

## Step-by-step

### 1. List + create route

Create `functions/api/contacts/[contactId]/notes.ts` with `onRequestGet` and `onRequestPost`.
Mirror the existing route style: pull `t = ctx.data.tenant`, never read `GHL_TOKEN` directly.

```ts
interface GhlNote { id: string; body: string; dateAdded?: string; userId?: string; }
interface NotesResp { notes?: GhlNote[]; }

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  const data = await ghlJson<NotesResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/notes`,
  );
  const notes = (data.notes ?? []).sort(
    (a, b) => +new Date(b.dateAdded ?? 0) - +new Date(a.dateAdded ?? 0),
  );
  return Response.json({ notes });
};
```

`onRequestPost` reads `{ body }`, rejects empty, posts to `/contacts/{contactId}/notes`,
returns the created note.

### 2. Edit + delete sub-route

Create `functions/api/contacts/[contactId]/notes/[noteId].ts` with `onRequestPut` and
`onRequestDelete`. Both proxy straight through and return `{ ok: true }` (or the updated note
for PUT).

### 3. Client API + hook

Add to `src/lib/api.ts`: `getNotes(contactId)`, `createNote(contactId, body)`,
`updateNote(contactId, noteId, body)`, `deleteNote(contactId, noteId)`. Add a `useNotes(contactId)`
hook in `src/hooks/useApi.ts` following the existing query pattern, with mutations that
invalidate the notes query on success.

### 4. `<NoteList>` component

New `src/components/NoteList.tsx`: newest-first list, relative timestamps, a textarea composer
pinned at the top, edit-in-place and a delete with a confirm. Reuse `Toast` for success/failure.
Render it on `src/routes/LeadDetail.tsx` under the existing detail block.

## Testing

In the test account, on a known lead:

1. `GET /api/contacts/{contactId}/notes` returns the existing notes for that contact.
2. Add a note in the UI; confirm it appears in GHL's contact timeline.
3. Edit it; confirm the body updates in GHL.
4. Delete it; confirm it disappears from both the app and GHL.
5. Empty note is rejected client-side and server-side.

## Acceptance criteria

- [ ] Notes for a contact list newest-first on the lead detail screen.
- [ ] Creating a note writes to GHL and shows immediately (optimistic or refetch).
- [ ] Editing and deleting a note are reflected in GHL.
- [ ] Empty/whitespace notes are rejected both client and server side.
- [ ] No route reads `GHL_TOKEN` directly; all use `ctx.data.tenant`.
- [ ] The Won-flow auto-note in `leads/[id].ts` still fires and now shows up in the list.

## Rollback

Server-only resource plus one new component and its wiring. Delete the two new route files,
the `NoteList` import/usage in `LeadDetail.tsx`, and the four `api.ts` functions. Nothing else
depends on them.
