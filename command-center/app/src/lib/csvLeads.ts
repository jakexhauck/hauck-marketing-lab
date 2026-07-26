// CSV import for the prospect book.
//
// Pure: parsing, header detection and row building live here with no React and
// no network, so the dialog stays thin and every rule below is unit-tested.
//
// Real exported lists are messy, so this handles what they actually contain:
// quoted fields with commas inside them, escaped quotes, CRLF from Windows, a
// UTF-8 BOM from Excel, and a "Full Name" column where a first and last name
// were expected.

// The fields a lead can be imported into. Everything else in the file is
// ignored: status, dates and attempt counts belong to the app, not to a
// spreadsheet someone bought.
export type LeadField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "phone"
  | "email"
  | "timezone"
  | "source"
  | "notes";

export const IMPORT_FIELDS: { field: LeadField; label: string }[] = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "fullName", label: "Full name (split)" },
  { field: "phone", label: "Phone" },
  { field: "email", label: "Email" },
  { field: "timezone", label: "Timezone" },
  { field: "source", label: "Source" },
  { field: "notes", label: "Notes" },
];

// Header spellings seen in the wild, normalized (lowercase, no spaces or
// punctuation) before comparison.
const HEADER_HINTS: Record<LeadField, string[]> = {
  firstName: ["firstname", "first", "fname", "givenname", "contactfirstname"],
  lastName: ["lastname", "last", "lname", "surname", "familyname", "contactlastname"],
  fullName: ["fullname", "name", "contactname", "contact", "leadname"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "cell", "cellphone", "telephone", "tel", "number", "primaryphone"],
  email: ["email", "emailaddress", "mail", "primaryemail"],
  timezone: ["timezone", "tz", "time"],
  source: ["source", "list", "listname", "campaign", "leadsource", "industry", "niche"],
  notes: ["notes", "note", "comments", "comment", "description", "company", "business", "businessname", "companyname"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Split one CSV line honouring quotes. Returns raw cell strings, untrimmed.
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

// Break the text into logical lines, keeping newlines that sit inside a quoted
// field (a multi-line address in one cell is one row, not three).
function splitRows(text: string): string[] {
  const rows: string[] = [];
  let row = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel writes and which would otherwise become part
  // of the first header name and stop it matching anything.
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      // Keep an escaped quote pair intact for splitLine to interpret.
      if (inQuotes === false && clean[i + 1] === '"') {
        row += '""';
        i++;
        inQuotes = true;
        continue;
      }
      row += ch;
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      rows.push(row);
      row = "";
      continue;
    }
    row += ch;
  }
  if (row.trim() !== "") rows.push(row);
  return rows.filter((r) => r.trim() !== "");
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const lines = splitRows(text);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line).map((c) => c.trim());
    // Pad short rows so a column index is always safe to read.
    while (cells.length < headers.length) cells.push("");
    return cells;
  });
  return { headers, rows };
}

// Best guess at which column is which, by header name. Returns a map of column
// index to field. A column it cannot place is left out, and the dialog lets the
// mapping be corrected by hand: guessing is a convenience, never the authority.
export function suggestMapping(headers: string[]): Record<number, LeadField> {
  const out: Record<number, LeadField> = {};
  const taken = new Set<LeadField>();

  headers.forEach((header, index) => {
    const norm = normalizeHeader(header);
    if (!norm) return;
    for (const { field } of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      const hints = HEADER_HINTS[field];
      // Exact match first, then a contains match, so "Mobile Phone" lands on
      // phone but "Phone Type" does not beat a plain "Phone" column.
      if (hints.includes(norm)) {
        out[index] = field;
        taken.add(field);
        return;
      }
    }
    for (const { field } of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (HEADER_HINTS[field].some((hint) => norm.includes(hint))) {
        out[index] = field;
        taken.add(field);
        return;
      }
    }
  });

  // A file with both a full name and a first name does not need the full name
  // column; the split would only fight the more precise one.
  if (Object.values(out).includes("firstName")) {
    for (const [index, field] of Object.entries(out)) {
      if (field === "fullName") delete out[Number(index)];
    }
  }
  return out;
}

export interface ImportLead {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  timezone: string;
  source: string;
  notes: string;
}

// "Jane Miller" -> first "Jane", last "Miller". Anything past the first space is
// the surname, so "Maria del Carmen Ruiz" keeps its full family name.
export function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Turn parsed rows plus a mapping into the payload the import endpoint takes.
// Rows with no phone number are dropped here as well as server-side, so the
// dialog can report the count BEFORE anything is sent.
export function buildImportRows(
  parsed: ParsedCsv,
  mapping: Record<number, LeadField>,
): { rows: ImportLead[]; skippedNoPhone: number } {
  const rows: ImportLead[] = [];
  let skippedNoPhone = 0;

  for (const cells of parsed.rows) {
    const lead: ImportLead = {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      timezone: "",
      source: "",
      notes: "",
    };

    for (const [indexKey, field] of Object.entries(mapping)) {
      const value = cells[Number(indexKey)] ?? "";
      if (!value) continue;
      if (field === "fullName") {
        const { firstName, lastName } = splitFullName(value);
        // A mapped first/last column wins over the split, whichever order the
        // columns appear in.
        if (!lead.firstName) lead.firstName = firstName;
        if (!lead.lastName) lead.lastName = lastName;
        continue;
      }
      if (field === "notes" && lead.notes) {
        // More than one column mapped to notes: keep both rather than pick.
        lead.notes = `${lead.notes} · ${value}`;
        continue;
      }
      lead[field] = value;
    }

    if (!lead.phone.trim()) {
      skippedNoPhone += 1;
      continue;
    }
    rows.push(lead);
  }

  return { rows, skippedNoPhone };
}
