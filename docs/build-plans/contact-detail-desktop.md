# Contact Detail Desktop (Cockpit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the client desktop app (lg+) a proper contact record when you click a contact: the approved "Cockpit" three-pane layout with identity, read-only pipeline stage, Notes + Conversation tabs, the linked opportunity, and a full action set, all on the real Modern Motion design tokens and wired to existing endpoints.

**Architecture:** The existing `ContactDetail` route stays as the phone layout below `lg` and renders a new `ContactDetailDesktop` at `lg+`, mirroring how `Contacts.tsx` already splits phone list vs `ContactsDesktop`. The desktop component reads the same query caches the phone screen uses (`useContactsQuery`, `useLeadsQuery`, `useConversationsQuery`, `useConversationMessagesQuery`, `useNotesQuery`, `usePipelines`) plus write hooks (`useUpsertContact`, `useCreateTask`). Read-only pipeline progress is a pure function unit-tested in isolation, then rendered by a dumb `PipelineStepper`.

**Tech Stack:** React 18 + TypeScript, React Router, TanStack Query, Tailwind v4 with the app's CSS custom-property tokens, lucide-react icons, Vitest.

## Global Constraints

- Never use em dashes in any code, comment, or UI string. Use commas, periods, parentheses, or colons.
- Client-facing UI must never name GoHighLevel/GHL (see [[project_team_tab_and_ghl_hidden]]).
- Pages before automations: wire only what has a real endpoint; anything without one is a clearly-labeled, non-destructive "Coming soon" toast, never a fake success (see [[feedback_pages_before_automations]]).
- The pipeline stage is READ-ONLY on this page. Show the stage; never offer to move it.
- Match existing desktop conventions: CSS token classes (`bg-[var(--surface)]`, `text-[var(--text-muted)]`, `label-cap`, `font-display`, `--grad-brand`, `--shadow-*`), not hardcoded colors.
- Desktop layout renders only inside `hidden lg:flex`; the phone layout is untouched.

**Reference (approved mockup):** scratchpad `contact-detail-variants.html` (artifact "Cockpit"). Buttons: Call, Text, Email, Book appointment, Add note, Add task, Edit contact, Add to list, view Opportunity, Merge, Export, Delete. Notes + Conversation tabs only (no Activity tab). No Owner row. No tag editing.

---

## File Structure

- Create `command-center/app/src/lib/pipelineProgress.ts` — pure `resolveStageProgress(stages, currentStageId)`.
- Create `command-center/app/src/lib/pipelineProgress.test.ts` — unit tests for the above.
- Create `command-center/app/src/components/contacts/PipelineStepper.tsx` — read-only stage stepper (dumb, presentational).
- Create `command-center/app/src/components/contacts/EditContactModal.tsx` — edit first/last/email/postal via `useUpsertContact`.
- Create `command-center/app/src/components/contacts/AddTaskModal.tsx` — title + optional due (reuses `DateTimeModal` for the instant) via `useCreateTask`.
- Create `command-center/app/src/components/contacts/ContactDetailDesktop.tsx` — the Cockpit layout, owns tab state, modal state, toast.
- Modify `command-center/app/src/routes/ContactDetail.tsx` — render phone layout at `<lg`, `ContactDetailDesktop` at `lg+`.

Reused as-is: `NoteList` (Notes tab), `DateTimeModal` (task due picker), `Avatar`, `Shell`, `usePipelines`, all listed hooks.

---

### Task 1: Pure pipeline-progress resolver

**Files:**
- Create: `command-center/app/src/lib/pipelineProgress.ts`
- Test: `command-center/app/src/lib/pipelineProgress.test.ts`

**Interfaces:**
- Consumes: `ApiPipelineStage` shape `{ id: string; name: string }` (from pipelines context / `ApiPipelineSummary.stages`).
- Produces:
  ```ts
  export type StepState = "done" | "current" | "upcoming";
  export interface StageStep { id: string; name: string; state: StepState; }
  export function resolveStageProgress(
    stages: { id: string; name: string }[],
    currentStageId: string | null | undefined,
  ): StageStep[];
  ```
  Rule: stages before the current index are `done`, the matching index is `current`, the rest are `upcoming`. If `currentStageId` is not found (or nullish), every stage is `upcoming` (nothing is falsely marked reached).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { resolveStageProgress } from "./pipelineProgress";

const STAGES = [
  { id: "s0", name: "New Lead" },
  { id: "s1", name: "Contacted" },
  { id: "s2", name: "Estimate Sent" },
  { id: "s3", name: "Job Scheduled" },
];

describe("resolveStageProgress", () => {
  it("marks earlier stages done, the match current, later upcoming", () => {
    const out = resolveStageProgress(STAGES, "s2");
    expect(out.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
    ]);
  });

  it("first stage current => none done", () => {
    const out = resolveStageProgress(STAGES, "s0");
    expect(out.map((s) => s.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("unknown or null stage id => all upcoming", () => {
    expect(
      resolveStageProgress(STAGES, "nope").every((s) => s.state === "upcoming"),
    ).toBe(true);
    expect(
      resolveStageProgress(STAGES, null).every((s) => s.state === "upcoming"),
    ).toBe(true);
  });

  it("empty stages => empty array", () => {
    expect(resolveStageProgress([], "s0")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/pipelineProgress.test.ts`
Expected: FAIL, `resolveStageProgress` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type StepState = "done" | "current" | "upcoming";

export interface StageStep {
  id: string;
  name: string;
  state: StepState;
}

// Read-only progress along a pipeline. The current stage is located by id; when
// it is missing (nullish or not in this pipeline) nothing is marked reached, so
// the UI never implies a position we cannot prove.
export function resolveStageProgress(
  stages: { id: string; name: string }[],
  currentStageId: string | null | undefined,
): StageStep[] {
  const currentIndex = currentStageId
    ? stages.findIndex((s) => s.id === currentStageId)
    : -1;
  return stages.map((s, i) => {
    let state: StepState = "upcoming";
    if (currentIndex >= 0) {
      if (i < currentIndex) state = "done";
      else if (i === currentIndex) state = "current";
    }
    return { id: s.id, name: s.name, state };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npx vitest run src/lib/pipelineProgress.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/pipelineProgress.ts command-center/app/src/lib/pipelineProgress.test.ts
git commit -m "feat(contacts): pure read-only pipeline-progress resolver"
```

---

### Task 2: PipelineStepper (read-only)

**Files:**
- Create: `command-center/app/src/components/contacts/PipelineStepper.tsx`

**Interfaces:**
- Consumes: `resolveStageProgress`, `StageStep` from Task 1.
- Produces:
  ```ts
  export default function PipelineStepper(props: {
    pipelineName: string;
    stages: { id: string; name: string }[];
    currentStageId: string | null | undefined;
  }): JSX.Element | null;
  ```
  Returns `null` when `stages` is empty (contact has no opportunity/pipeline, so no stage strip renders).

- [ ] **Step 1: Implement the component**

Presentational only. Header row: `label-cap` reading `Pipeline · {pipelineName}` on the left, and a muted read-only marker on the right (`<Clock size={12}/>` + "Read-only view", using `text-[var(--text-faint)]`). Below, a horizontal stepper built from `resolveStageProgress(stages, currentStageId)`:

- Each step is a flex column, `flex-1`, with a connector bar (`h-0.5`) behind the node, a 15px round node, and an 11px label.
- `done`/`current` node: `background: var(--brand)`, border brand; connector for reached steps uses `var(--brand)`, otherwise `var(--border-strong)`.
- `current` node adds a ring: `box-shadow: 0 0 0 4px var(--brand-tint-strong)`; label uses `text-[var(--brand-text)]`.
- `upcoming` node: `bg-[var(--surface)] border-[var(--border-strong)]`, label `text-[var(--text-faint)]`.
- The first step hides its connector bar.
- No `onClick`, no draggable, no buttons: it is inert by construction.

Wrap in a card: `rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-sm)]`.

- [ ] **Step 2: Verify it typechecks and builds**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors referencing PipelineStepper.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/contacts/PipelineStepper.tsx
git commit -m "feat(contacts): read-only pipeline stepper component"
```

---

### Task 3: Edit contact + Add task modals

**Files:**
- Create: `command-center/app/src/components/contacts/EditContactModal.tsx`
- Create: `command-center/app/src/components/contacts/AddTaskModal.tsx`

**Interfaces:**
- Consumes: `useUpsertContact` (input `{ contactId, firstName?, lastName?, email?, postalCode?, source? }`), `useCreateTask` (input `{ contactId, title, dueDate? }`), `DateTimeModal` (`{ title, subtitle?, confirmLabel, pending?, onClose, onConfirm(iso) }`), `ApiContact`.
- Produces:
  ```ts
  export default function EditContactModal(props: {
    contact: ApiContact;
    onClose: () => void;
    onSaved: (msg: string) => void;
  }): JSX.Element;

  export default function AddTaskModal(props: {
    contactId: string;
    onClose: () => void;
    onSaved: (msg: string) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Build EditContactModal**

Centered overlay matching `DateTimeModal`'s shell (`fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5`, inner card `bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 w-full max-w-md`, click-outside closes, inner `onClick` stops propagation). Fields: First name, Last name (split `contact.name` on first space for defaults), Email, Postal code. On save call `useUpsertContact().mutate({ contactId: contact.id, firstName, lastName, email, postalCode })`, then `onSaved("Contact updated")` and `onClose()`; on error `onSaved("Could not update contact")`. Disable the confirm button while `isPending`. Inputs reuse the textarea/input token styling used in `NoteList` (`border border-[var(--border)] bg-[var(--surface)] ... focus:border-[var(--ring)]`).

- [ ] **Step 2: Build AddTaskModal**

Single "What needs doing?" text input plus an optional due time. Keep it simple: a title input, a "Set due time" toggle that opens `DateTimeModal` (reuse; its `onConfirm(iso)` stores the ISO and shows it as a chip). On save call `useCreateTask().mutate({ contactId, title, dueDate })`, then `onSaved("Task added")`. Empty title disables save.

- [ ] **Step 3: Verify build**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/components/contacts/EditContactModal.tsx command-center/app/src/components/contacts/AddTaskModal.tsx
git commit -m "feat(contacts): edit-contact and add-task modals"
```

---

### Task 4: ContactDetailDesktop (Cockpit layout)

**Files:**
- Create: `command-center/app/src/components/contacts/ContactDetailDesktop.tsx`

**Interfaces:**
- Consumes: `useParams` (`contactId`), `useNavigate`, `useAuth`, `useNow`, `usePipelines`, `useContactsQuery`, `useLeadsQuery`, `useConversationsQuery`, `useConversationMessagesQuery`, `useNotesQuery`, `PipelineStepper` (Task 2), `EditContactModal` + `AddTaskModal` (Task 3), `NoteList`, `Avatar`, `resolveStageProgress` types, `formatPhone`/`e164` (`lib/phone`), `timeAgo`.
- Produces: `export default function ContactDetailDesktop(): JSX.Element;` (self-contained; reads `contactId` from the route).

**Data resolution (same as the phone `ContactDetail`):**
- `contact` = `useContactsQuery().data?.contacts.find(c => c.id === contactId)`.
- `contactLeads` = leads filtered by `contactId`; `primaryLead = contactLeads[0] ?? null`.
- `pipeline` = `pipelines.find(p => p.id === primaryLead?.pipelineId)`; stepper gets `pipeline?.stages ?? []` and `primaryLead?.pipelineStageId`.
- `hasConversation` = any conversation with this `contactId`; `messages` = `useConversationMessagesQuery(contactId, useReal)` for the Conversation tab preview (show the last ~6, `direction`-styled bubbles, with an "Open full conversation" link to `/conversations/${contactId}`).
- Loading and not-found states reuse the phone component's treatment (skeleton / "Contact not found").

- [ ] **Step 1: Build the three-pane layout**

Grid `lg:grid-cols-[288px_1fr_288px] gap-[18px]` inside a `DesktopPage`-less full-height wrapper (this renders inside `Shell` already, like `ContactsDesktop`). Left/right rails `lg:sticky lg:top-[80px]`. Panels exactly as the approved mockup:

- **Left:** identity card (Avatar lg, name `font-display`, source line, "Hot" chip only when a `hot`/`hot lead` tag is present, stage pill from the current stage name), a 3-up Call/Text/Email row (`tel:`/`sms:`/`mailto:` from `e164(contact.phone)` and `contact.email`; render each only when that channel exists, else a disabled tile), and a Details card: phone (with copy button), email, Added date, Last activity, then the tags as read-only chips. NO Owner row. NO add-tag control.
- **Center:** `PipelineStepper` card (Task 2), then a card whose header is a two-tab subnav (Notes / Conversation). Notes tab renders `<NoteList contactId={contact.id} onToast={pushToast} />`. Conversation tab renders the message bubbles + "Open full conversation" link, or an empty state when there is no conversation.
- **Right:** Quick actions card (Book appointment [primary], Add note, Add task, Edit contact, Add to list), Opportunity card (one `rec` row per lead linking to `/lead/${lead.id}`, showing value via `Intl.NumberFormat` USD + current stage name; empty state when none), and a More card (Merge, Export, Delete).

- [ ] **Step 2: Wire the real actions**

- Call/Text/Email: anchor links (already channel-gated).
- Add note (quick action): `setTab("notes")` and scroll the notes card into view.
- Add task: open `AddTaskModal`.
- Edit contact: open `EditContactModal`.
- Opportunity row: `navigate('/lead/' + lead.id)`.
- View / Open full conversation: `navigate('/conversations/' + contactId)`.
- Copy phone: `navigator.clipboard.writeText(e164(contact.phone))` then toast "Phone copied".

- [ ] **Step 3: Wire deferred actions honestly**

Book appointment, Add to list, Merge, Export, Delete have no contact-scoped endpoint yet. Each calls `pushToast("Coming soon")` and does nothing else. Do NOT show a fake success. (Book appointment is a fast-follow once the calendar-selection flow is factored out of the leads surface.)

Implement `pushToast` as a minimal local toast: a `useState<string | null>`, a fixed bottom-center pill (`fixed bottom-6 left-1/2 -translate-x-1/2 ... bg-[var(--text)] text-[var(--surface)]`), auto-cleared after ~2s via `setTimeout` in a `useEffect`. (Reuse an existing Toast/useToast if one is found in the codebase; otherwise this inline toast.)

- [ ] **Step 4: Verify build + types**

Run: `cd command-center/app && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/components/contacts/ContactDetailDesktop.tsx
git commit -m "feat(contacts): desktop cockpit contact detail"
```

---

### Task 5: Route integration

**Files:**
- Modify: `command-center/app/src/routes/ContactDetail.tsx`

**Interfaces:**
- Consumes: `ContactDetailDesktop` (Task 4).

- [ ] **Step 1: Split phone vs desktop**

Wrap the current phone markup (the `Shell` children) in `<div className="flex min-h-0 flex-1 flex-col lg:hidden">` and add, as a sibling inside `Shell`, `<div className="hidden min-h-0 flex-1 lg:flex"><ContactDetailDesktop /></div>` — exactly the pattern in `Contacts.tsx`. Keep a single `Shell` wrapper. The loading and not-found branches: keep the phone ones inside the `lg:hidden` block; `ContactDetailDesktop` renders its own loading/not-found so the desktop pane is self-sufficient.

- [ ] **Step 2: Verify build**

Run: `cd command-center/app && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual verification (real app, Jake's browser)**

Per [[feedback_build_loop_autopilot]] + verification-before-completion: run the app, open a contact at desktop width, confirm: three panes render, pipeline stepper shows the client's real stages with the correct current stage and is inert, Notes tab creates a real note, Conversation tab shows real messages and links out, Opportunity links to the lead, Edit contact saves, Add task saves, deferred buttons toast "Coming soon". Screenshot both light and dark (M9 visual proof).

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/routes/ContactDetail.tsx
git commit -m "feat(contacts): render desktop cockpit at lg+, phone layout below"
```

---

## Self-Review

- **Spec coverage:** identity, read-only real pipeline stage (Task 1/2/4), Notes + Conversation tabs no Activity (Task 4), no Owner (Task 4 details card), no tag editing (Task 4), full button set with honest placeholders (Task 4), desktop-only split (Task 5). Covered.
- **Placeholders:** deferred buttons are intentional product placeholders (toast), not plan placeholders; every code step has real content.
- **Type consistency:** `resolveStageProgress(stages, currentStageId)` and `StageStep`/`StepState` names match across Tasks 1, 2, 4. Hook input shapes copied verbatim from `useApi.ts`.
- **Deferred with reason:** Book appointment, Add to list, Merge, Export, Delete lack contact-scoped endpoints; shipped as "Coming soon" per pages-before-automations, flagged to Jake.
