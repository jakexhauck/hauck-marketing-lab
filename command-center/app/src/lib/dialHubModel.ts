// Client-side pure model for the Setter Suite Dialing Hub editor.
//
// The document shape mirrors functions/lib/dialHub.ts, deliberately duplicated
// rather than shared: functions/ and src/ are separate TypeScript projects with
// separate tsconfigs in this repo, and every other setter surface duplicates
// the same way (setterModel.ts vs setterMetrics.ts). The server owns
// normalization; this file owns editing and rendering decisions.
//
// Everything here is pure so the editor can be tested at all: this repo has no
// component-test infrastructure, so any logic left inside the .tsx is logic
// with no test.

export interface DialHubRow {
  id: string;
  label: string;
  value: string;
}

export interface DialHubSection {
  id: string;
  title: string;
  note: string;
  rows: DialHubRow[];
}

export interface DialHub {
  sections: DialHubSection[];
}

export type RowKind = "link" | "text" | "blank";

// What a row IS, derived from what is in it. A row carries no type field: the
// alternative was a dropdown on every row, which is a second thing to maintain
// that can disagree with the value it describes.
//
// Strict about schemes. Only http and https are links, so a half-typed value
// never becomes a button that navigates somewhere unintended, and a
// javascript: or data: value can never be handed to an anchor's href.
export function rowKind(value: string): RowKind {
  const v = value.trim();
  if (!v) return "blank";
  try {
    const proto = new URL(v).protocol;
    if (proto === "http:" || proto === "https:") return "link";
  } catch {
    /* not a URL: it is a string to copy */
  }
  return "text";
}

// The edit operations below all return a new document and never mutate their
// input, so React sees a changed reference and the autosave can hold on to the
// exact document it is about to write.

function mapSection(
  hub: DialHub,
  sectionId: string,
  fn: (section: DialHubSection) => DialHubSection,
): DialHub {
  return { sections: hub.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

function mapRow(
  hub: DialHub,
  sectionId: string,
  rowId: string,
  fn: (row: DialHubRow) => DialHubRow,
): DialHub {
  return mapSection(hub, sectionId, (s) => ({
    ...s,
    rows: s.rows.map((r) => (r.id === rowId ? fn(r) : r)),
  }));
}

export function setRowValue(hub: DialHub, sectionId: string, rowId: string, value: string): DialHub {
  return mapRow(hub, sectionId, rowId, (r) => ({ ...r, value }));
}

export function setRowLabel(hub: DialHub, sectionId: string, rowId: string, label: string): DialHub {
  return mapRow(hub, sectionId, rowId, (r) => ({ ...r, label }));
}

export function setSectionTitle(hub: DialHub, sectionId: string, title: string): DialHub {
  return mapSection(hub, sectionId, (s) => ({ ...s, title }));
}

export function setSectionNote(hub: DialHub, sectionId: string, note: string): DialHub {
  return mapSection(hub, sectionId, (s) => ({ ...s, note }));
}

// Ids are passed in rather than generated here so these stay pure and the tests
// stay deterministic. Callers use newId() below.
export function addRow(hub: DialHub, sectionId: string, id: string): DialHub {
  return mapSection(hub, sectionId, (s) => ({
    ...s,
    rows: [...s.rows, { id, label: "", value: "" }],
  }));
}

export function removeRow(hub: DialHub, sectionId: string, rowId: string): DialHub {
  return mapSection(hub, sectionId, (s) => ({ ...s, rows: s.rows.filter((r) => r.id !== rowId) }));
}

export function addSection(hub: DialHub, id: string): DialHub {
  return { sections: [...hub.sections, { id, title: "", note: "", rows: [] }] };
}

export function removeSection(hub: DialHub, sectionId: string): DialHub {
  return { sections: hub.sections.filter((s) => s.id !== sectionId) };
}

// Ids only need to be unique within one document, never across clients, and
// they are written straight back to the server as-is.
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}
