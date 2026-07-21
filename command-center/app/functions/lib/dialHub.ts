// The Setter Suite Dialing Hub document: the pure, server-side core.
//
// A hub is one client's dialing reference, transcribed from the Google Sheet
// Jake's setters used to keep open in another window: sections of labelled rows
// whose values are either a link (booking calendar, script, SOP) or a string to
// paste into the CRM (the dialing tags).
//
// The whole document is user-editable, stored as a single jsonb column and
// posted back whole on every autosave. That makes normalizeHub below the trust
// boundary for this feature: whatever is in the column or on the wire, valid or
// not, has to come out of it as a document the UI can render without checking a
// single field. Nothing else in the stack re-validates.
//
// A row carries no type. Whether it renders as a link or a copyable string is
// derived from its value at render time (src/lib/dialHubModel.ts, rowKind), so
// there is no type field to get out of step with the value it describes.

export interface DialHubRow {
  id: string;
  label: string;
  value: string;
}

export interface DialHubSection {
  id: string;
  title: string;
  // Guidance shown under the heading, e.g. the Calendar section's "copy paste
  // their contact info". Always a string; "" means no note.
  note: string;
  rows: DialHubRow[];
}

export interface DialHub {
  sections: DialHubSection[];
}

// Caps. These exist so one runaway paste cannot store an unbounded document in
// a column every page load reads; they are far above any real hub.
export const MAX_SECTIONS = 40;
export const MAX_ROWS_PER_SECTION = 100;
export const MAX_LABEL_LEN = 200;
export const MAX_VALUE_LEN = 2000;

// The seed a client with no saved hub opens on, transcribed from Jake's sheet.
// Link rows ship empty on purpose: they are per client, and a wrong link is
// worse than a visibly missing one. The tag rows ship filled because they are
// the same everywhere until someone changes them.
//
// The sheet's own heading typos ("SCIPT", "RECOURCES") are corrected here.
export const DEFAULT_HUB: DialHub = {
  sections: [
    {
      id: "script",
      title: "Script / Framework",
      note: "",
      rows: [
        {
          id: "script-main",
          label: "Complete Dialing Script / Voicemail / Objection Handling",
          value: "",
        },
      ],
    },
    {
      id: "calendar",
      title: "Calendar",
      note: "Use these to book manually. Copy and paste the lead's contact info across.",
      rows: [
        { id: "calendar-estimate", label: "Estimate Calendar", value: "" },
        { id: "calendar-job", label: "Job Calendar", value: "" },
        { id: "calendar-phone", label: "Phone Appointment", value: "" },
        { id: "calendar-confirm", label: "Confirming Appointments - MUST DO", value: "" },
      ],
    },
    {
      id: "resources",
      title: "Resources",
      note: "",
      rows: [{ id: "resources-company", label: "General Company Information Sheet", value: "" }],
    },
    {
      id: "tags",
      title: "Dialing Tags",
      note: "The no-answer tags are for lead form opt-ins, funnel survey completions, and phone appointments booked through the funnel.",
      rows: [
        { id: "tags-unqualified", label: "If unqualified", value: "services-unqualified" },
        {
          id: "tags-followup",
          label: "If needs follow-up (add notes and task)",
          value: "mentorship-follow-up",
        },
        { id: "tags-day1", label: "Didn't Answer Day 1", value: "no answer day 1" },
        { id: "tags-day2", label: "Didn't Answer Day 2", value: "no answer day 2" },
        { id: "tags-day3", label: "Didn't Answer Day 3", value: "no answer day 3" },
        { id: "tags-day4", label: "Didn't Answer Day 4", value: "no answer day 4" },
      ],
    },
    {
      id: "sops",
      title: "SOPs",
      note: "",
      rows: [{ id: "sops-dialing", label: "Full Dialing SOP", value: "" }],
    },
  ],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

// Ids have to be unique for React keys and for the edit operations to target a
// row. A supplied id wins; anything missing, blank, non-string or already taken
// falls back to its position, which is stable across a normalize.
function claimId(supplied: unknown, fallback: string, taken: Set<string>): string {
  const wanted = typeof supplied === "string" ? supplied.trim() : "";
  if (wanted && !taken.has(wanted)) {
    taken.add(wanted);
    return wanted;
  }
  let id = fallback;
  let n = 1;
  while (taken.has(id)) id = `${fallback}-${n++}`;
  taken.add(id);
  return id;
}

// Coerce anything at all into a renderable hub.
//
// An absent or malformed document falls back to the seed template, but an
// explicitly EMPTY one does not: deleting every section is a real state an
// admin can reach, and resurrecting the seed rows on the next read would make
// that deletion impossible to keep.
export function normalizeHub(raw: unknown): DialHub {
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return DEFAULT_HUB;

  const sectionIds = new Set<string>();
  const sections: DialHubSection[] = [];

  for (const rawSection of raw.sections.slice(0, MAX_SECTIONS)) {
    if (!isRecord(rawSection)) continue;
    const id = claimId(rawSection.id, `sec-${sections.length}`, sectionIds);

    const rowIds = new Set<string>();
    const rows: DialHubRow[] = [];
    const rawRows = Array.isArray(rawSection.rows) ? rawSection.rows : [];
    for (const rawRow of rawRows.slice(0, MAX_ROWS_PER_SECTION)) {
      if (!isRecord(rawRow)) continue;
      rows.push({
        id: claimId(rawRow.id, `${id}-row-${rows.length}`, rowIds),
        label: str(rawRow.label, MAX_LABEL_LEN),
        value: str(rawRow.value, MAX_VALUE_LEN),
      });
    }

    sections.push({
      id,
      title: str(rawSection.title, MAX_LABEL_LEN),
      note: str(rawSection.note, MAX_VALUE_LEN),
      rows,
    });
  }

  return { sections };
}

export interface HubValidation {
  ok: boolean;
  code?: string;
}

export interface HubBody {
  tenantId?: unknown;
  hub?: unknown;
}

// Shape check for the WRITE path, which is why it insists on sections being an
// array even though normalizeHub would happily coerce without it.
//
// Coerce-rather-than-reject is the right default when rendering: a malformed
// stored document should still paint. It is the wrong default when writing. A
// body of `{ hub: {} }` would normalize to DEFAULT_HUB and then be upserted
// straight over a client's fully built hub, returning 200 with no history and
// no undo. Silently replacing real data with the seed template is worse than a
// 400, so the write path rejects what the read path forgives.
export function validateHubBody(body: HubBody): HubValidation {
  if (typeof body.tenantId !== "string" || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  if (!isRecord(body.hub)) return { ok: false, code: "missing_hub" };
  if (!Array.isArray((body.hub as { sections?: unknown }).sections)) {
    return { ok: false, code: "missing_hub" };
  }
  return { ok: true };
}
