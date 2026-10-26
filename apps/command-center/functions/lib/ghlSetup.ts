import { PRESERVED_FIELDS } from "./ghlCalendarWrite";

// Client > GHL setup pages (Jake, 2026-10-26): Business Profile, Staff, Custom
// Fields, Calendars, Pipelines, Media, Workflows and Phone Numbers, each a copy
// of the GHL screen it changes, reading and writing the client's real
// sub-account. This file is the pure half: what the onboarding form says, how
// GHL's records are shaped for the pages, and the bodies sent back. The
// endpoints (functions/api/admin/clients/[tenantId]/ghl-setup) do the calls.
//
// Endpoints and fields are from GHL's own OpenAPI specs
// (github.com/GoHighLevel/highlevel-api-docs, apps/*.json), read 2026-10-26.

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const rows = (v: unknown, key: string): Row[] => {
  const arr = v && typeof v === "object" && !Array.isArray(v) ? (v as Row)[key] : v;
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Row[]) : [];
};

// ---------------------------------------------------------------------------
// The onboarding form
// ---------------------------------------------------------------------------

/** A day's hours as "HH:MM" pairs, or null for closed. */
export type DayRange = [string, string];
export type WeekHours = (DayRange | null)[]; // index 0 = Sunday, GHL's own order

export interface FormFacts {
  businessName: string;
  ownerFirst: string;
  ownerLast: string;
  ownerFull: string;
  email: string;
  phone: string; // E.164
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  timezone: string;
  hours: WeekHours | null; // null when the form gave no hours at all
}

const DAY_KEYS = ["hoursSunday", "hoursMonday", "hoursTuesday", "hoursWednesday", "hoursThursday", "hoursFriday", "hoursSaturday"];

/** "(815) 278-4229", "8152784229" or "+1 815..." as +18152784229. "" when it is not a US number. */
export function toE164(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return "";
}

// "8am", "8:30 am", "17:00", "5 PM" as minutes after midnight.
function clockOf(raw: string, fallbackPm: boolean): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  else if (ap === "a" && h === 12) h = 0;
  else if (!ap && fallbackPm && h < 12 && h > 0) h += 12;
  return h * 60 + min;
}

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/**
 * One day of the form's hours box. "8am - 6pm", "9am-5pm", "7:30am to 4:30pm".
 * Blank, "Closed", "Off" and anything unreadable are closed: a calendar left
 * open on a day the owner never works is worse than one they open themselves.
 */
export function parseHoursText(raw: unknown): DayRange | null {
  const s = str(raw).toLowerCase();
  if (!s || /closed|off|none|n\/a/.test(s)) return null;
  const parts = s.split(/\s*(?:-|–|to)\s*/);
  if (parts.length !== 2) return null;
  const open = clockOf(parts[0], false);
  // "9 - 5" means 9am to 5pm: a bare closing hour before the opening is afternoon.
  let close = clockOf(parts[1], false);
  if (open !== null && close !== null && close <= open && !/[ap]/.test(parts[1])) close = clockOf(parts[1], true);
  if (open === null || close === null || close <= open) return null;
  return [hhmm(open), hhmm(close)];
}

function websiteOf(raw: string): string {
  if (!raw || raw.includes("@") || !raw.includes(".")) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function formFacts(intake: Row): FormFacts {
  const full = str(intake.contactName).replace(/\s+/g, " ");
  const [first, ...rest] = full.split(" ");
  const street = [str(intake.addressStreet), str(intake.addressUnit)].filter(Boolean).join(", ");
  const days = DAY_KEYS.map((k) => parseHoursText(intake[k]));
  const anyHours = DAY_KEYS.some((k) => str(intake[k]));
  return {
    businessName: str(intake.name),
    ownerFirst: first ?? "",
    ownerLast: rest.join(" "),
    ownerFull: full,
    email: str(intake.contactEmail),
    phone: toE164(str(intake.contactPhone)),
    website: websiteOf(str(intake.websiteUrl)),
    street,
    city: str(intake.addressCity),
    state: str(intake.addressState),
    zip: str(intake.addressZip),
    country: "US",
    timezone: str(intake.timezone),
    hours: anyHours ? days : null,
  };
}

// ---------------------------------------------------------------------------
// Business Profile (GET /locations/:id, PUT /locations/:id with the agency token)
// ---------------------------------------------------------------------------

export interface Profile {
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  logoUrl: string;
  companyId: string;
}

export const PROFILE_FIELDS = ["name", "phone", "website", "address", "city", "state", "postalCode", "country", "timezone"] as const;
export type ProfileInput = Record<(typeof PROFILE_FIELDS)[number], string>;

export function shapeProfile(raw: unknown): Profile {
  const l = ((raw as Row)?.location ?? raw ?? {}) as Row;
  return {
    name: str(l.name),
    phone: str(l.phone),
    email: str(l.email),
    website: str(l.website),
    address: str(l.address),
    city: str(l.city),
    state: str(l.state),
    postalCode: str(l.postalCode),
    country: str(l.country) || "US",
    timezone: str(l.timezone),
    logoUrl: str(l.logoUrl),
    companyId: str(l.companyId),
  };
}

export function parseProfileInput(body: unknown): ProfileInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Row;
  const out = {} as ProfileInput;
  for (const k of PROFILE_FIELDS) out[k] = str(b[k]).slice(0, 300);
  if (!out.name) return null;
  if (out.phone && !toE164(out.phone) && !/^\+\d{8,15}$/.test(out.phone)) return null;
  if (out.phone) out.phone = toE164(out.phone) || out.phone;
  return out;
}

/** The PUT body. GHL requires companyId; blank fields are left out, never sent as "". */
export function buildProfileUpdate(input: ProfileInput, companyId: string): Row {
  const body: Row = { companyId };
  for (const k of PROFILE_FIELDS) if (input[k]) body[k] = input[k];
  return body;
}

// ---------------------------------------------------------------------------
// Staff (GET /users/?locationId, POST /users/, PUT /users/:id)
// ---------------------------------------------------------------------------

export interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string; // "account" | "agency"
  role: string; // "admin" | "user"
  locationIds: string[];
}

export function shapeUsers(raw: unknown): StaffUser[] {
  return rows(raw, "users")
    .filter((u) => u.deleted !== true)
    .map((u) => {
      const roles = (u.roles ?? {}) as Row;
      return {
        id: str(u.id),
        firstName: str(u.firstName),
        lastName: str(u.lastName),
        email: str(u.email),
        phone: str(u.phone),
        type: str(roles.type) || "account",
        role: str(roles.role) || "user",
        locationIds: Array.isArray(roles.locationIds) ? roles.locationIds.map(str).filter(Boolean) : [],
      };
    })
    .filter((u) => u.id);
}

export interface StaffInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "admin" | "user";
}

export function parseStaffInput(body: unknown): StaffInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Row;
  const firstName = str(b.firstName).slice(0, 80);
  const email = str(b.email).toLowerCase().slice(0, 200);
  if (!firstName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const phone = str(b.phone) ? toE164(str(b.phone)) : "";
  if (str(b.phone) && !phone) return null;
  return { firstName, lastName: str(b.lastName).slice(0, 80), email, phone, role: b.role === "admin" ? "admin" : "user" };
}

/**
 * A new sub-account user. GHL wants a password; the owner never types this one,
 * they set their own with "Forgot password" (the page says so once, with the
 * password, when the user is created).
 */
export function buildUserCreate(input: StaffInput, companyId: string, locationId: string, password: string): Row {
  const body: Row = {
    companyId,
    firstName: input.firstName,
    lastName: input.lastName || "-",
    email: input.email,
    password,
    type: "account",
    role: input.role,
    locationIds: [locationId],
  };
  if (input.phone) body.phone = input.phone;
  return body;
}

/** 16 characters with an upper, a lower, a digit and a symbol, which GHL's rule asks for. */
export function newPassword(rand: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const out = sets.map((s) => s[rand(s.length)]);
  while (out.length < 16) out.push(all[rand(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

/** Adding an existing user (Jake) to this sub-account: their list plus this one. */
export function withLocation(user: StaffUser, locationId: string): string[] {
  return user.locationIds.includes(locationId) ? user.locationIds : [...user.locationIds, locationId];
}

/**
 * Taking a user off this sub-account. Never a DELETE: a GHL user can sit in
 * several sub-accounts (Jake is in every client's), and deleting removes them
 * from all of them. Null when this is their only sub-account, because GHL will
 * not keep a user with none; that one is removed in GHL by hand.
 */
export function withoutLocation(user: StaffUser, locationId: string): string[] | null {
  const next = user.locationIds.filter((l) => l !== locationId);
  return next.length ? next : null;
}

// ---------------------------------------------------------------------------
// Custom Fields (GET/POST/PUT/DELETE /locations/:id/customFields)
// ---------------------------------------------------------------------------

export interface CustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  model: string;
  placeholder: string;
  options: string[];
}

// The types this page creates. GHL's create body has no way to send dropdown
// or checkbox options (customFields spec, 2026-10-26), so those are made in GHL.
export const FIELD_TYPES = ["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETORY", "DATE"] as const;

export function shapeFields(raw: unknown): CustomField[] {
  return rows(raw, "customFields")
    .map((f) => ({
      id: str(f.id),
      name: str(f.name),
      fieldKey: str(f.fieldKey),
      dataType: str(f.dataType),
      model: str(f.model) || "contact",
      placeholder: str(f.placeholder),
      options: Array.isArray(f.picklistOptions) ? f.picklistOptions.map(str).filter(Boolean) : [],
    }))
    .filter((f) => f.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface FieldInput {
  name: string;
  dataType: string;
  placeholder: string;
}

/** creating: the type must be one this page makes. Editing keeps the field's own type. */
export function parseFieldInput(body: unknown, creating: boolean): FieldInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Row;
  const name = str(b.name).slice(0, 200);
  const dataType = str(b.dataType) || "TEXT";
  if (!name) return null;
  if (creating && !(FIELD_TYPES as readonly string[]).includes(dataType)) return null;
  return { name, dataType, placeholder: str(b.placeholder).slice(0, 200) };
}

export function buildFieldBody(input: FieldInput, creating: boolean): Row {
  const body: Row = { name: input.name };
  if (input.placeholder) body.placeholder = input.placeholder;
  if (creating) {
    body.dataType = input.dataType;
    body.model = "contact";
  }
  return body;
}

// ---------------------------------------------------------------------------
// Calendars (GET /calendars/?locationId, PUT /calendars/:id)
// ---------------------------------------------------------------------------

export interface SetupCalendar {
  id: string;
  name: string;
  active: boolean;
  calendarType: string;
  team: string[]; // user ids
  hours: (DayRange[] | null)[]; // index 0 = Sunday
  slotDuration: number | null;
  slotBuffer: number | null;
  noticeHours: number | null;
  rangeDays: number | null;
  perDay: number | null;
  autoConfirm: boolean;
}

function unitTo(n: number | null, unit: string, target: "hours" | "days"): number | null {
  if (n === null) return null;
  const hours = unit === "days" ? n * 24 : unit === "weeks" ? n * 24 * 7 : unit === "months" ? n * 24 * 30 : unit === "mins" ? n / 60 : n;
  return target === "hours" ? hours : hours / 24;
}

export function shapeCalendar(c: Row): SetupCalendar {
  const hours: (DayRange[] | null)[] = [null, null, null, null, null, null, null];
  for (const oh of rows(c.openHours, "")) {
    const ranges = rows(oh.hours, "").map((h) => [hhmm((num(h.openHour) ?? 0) * 60 + (num(h.openMinute) ?? 0)), hhmm((num(h.closeHour) ?? 0) * 60 + (num(h.closeMinute) ?? 0))] as DayRange);
    for (const d of Array.isArray(oh.daysOfTheWeek) ? oh.daysOfTheWeek : []) {
      if (typeof d === "number" && d >= 0 && d <= 6 && ranges.length) hours[d] = [...(hours[d] ?? []), ...ranges];
    }
  }
  return {
    id: str(c.id),
    name: str(c.name),
    active: c.isActive !== false,
    calendarType: str(c.calendarType),
    team: rows(c.teamMembers, "").map((m) => str(m.userId)).filter(Boolean),
    hours,
    slotDuration: num(c.slotDuration),
    slotBuffer: num(c.slotBuffer),
    noticeHours: unitTo(num(c.allowBookingAfter), str(c.allowBookingAfterUnit) || "hours", "hours"),
    rangeDays: unitTo(num(c.allowBookingFor), str(c.allowBookingForUnit) || "days", "days"),
    perDay: num(c.appoinmentPerDay) || null,
    autoConfirm: c.autoConfirm === true,
  };
}

export function shapeCalendars(raw: unknown): SetupCalendar[] {
  return rows(raw, "calendars").map(shapeCalendar).filter((c) => c.id);
}

export interface CalendarPatch {
  name?: string;
  active?: boolean;
  team?: string[];
  hours?: (DayRange[] | null)[];
  slotDuration?: number;
  slotBuffer?: number;
  noticeHours?: number;
  rangeDays?: number;
  perDay?: number | null;
  autoConfirm?: boolean;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseCalendarPatch(body: unknown): CalendarPatch | string {
  if (!body || typeof body !== "object") return "Nothing to save.";
  const b = body as Row;
  const p: CalendarPatch = {};
  if (b.name !== undefined) {
    if (!str(b.name)) return "The calendar needs a name.";
    p.name = str(b.name).slice(0, 120);
  }
  if (b.active !== undefined) p.active = b.active === true;
  if (b.autoConfirm !== undefined) p.autoConfirm = b.autoConfirm === true;
  if (b.team !== undefined) {
    if (!Array.isArray(b.team)) return "Bad team list.";
    p.team = [...new Set(b.team.map(str).filter(Boolean))];
    if (!p.team.length) return "A calendar needs at least one team member.";
  }
  if (b.hours !== undefined) {
    if (!Array.isArray(b.hours) || b.hours.length !== 7) return "Bad hours.";
    const hours: (DayRange[] | null)[] = [];
    for (const day of b.hours) {
      if (day === null) {
        hours.push(null);
        continue;
      }
      if (!Array.isArray(day) || !day.length) return "Bad hours.";
      const ranges: DayRange[] = [];
      for (const r of day) {
        if (!Array.isArray(r) || !CLOCK.test(str(r[0])) || !CLOCK.test(str(r[1])) || str(r[1]) <= str(r[0])) return "Each day's closing time must be after its opening time.";
        ranges.push([str(r[0]), str(r[1])]);
      }
      hours.push(ranges);
    }
    p.hours = hours;
  }
  for (const k of ["slotDuration", "slotBuffer", "noticeHours", "rangeDays"] as const) {
    if (b[k] === undefined) continue;
    const n = num(b[k]);
    if (n === null || n < 0 || n > 10000) return `Bad ${k}.`;
    p[k] = n;
  }
  if (b.perDay !== undefined) {
    const n = b.perDay === null || b.perDay === "" ? null : num(b.perDay);
    if (n !== null && (n < 0 || n > 1000)) return "Bad bookings per day.";
    p.perDay = n;
  }
  return p;
}

const toGhlHours = (hours: (DayRange[] | null)[]) =>
  hours.flatMap((ranges, day) =>
    ranges
      ? [
          {
            daysOfTheWeek: [day],
            hours: ranges.map(([o, c]) => ({
              openHour: Number(o.slice(0, 2)),
              openMinute: Number(o.slice(3)),
              closeHour: Number(c.slice(0, 2)),
              closeMinute: Number(c.slice(3)),
            })),
          },
        ]
      : [],
  );

/**
 * The PUT body for a calendar edit. Read-modify-write, for the reason in
 * ghlCalendarWrite.ts: a PUT that leaves out slot or buffer settings resets
 * them. So the calendar's own settings ride along, then the edit lands on top.
 * Team members already on the calendar keep their own settings (location,
 * priority); new ones join as primary-priority members.
 */
export function buildCalendarUpdate(current: Row, patch: CalendarPatch): Row {
  const body: Row = {};
  for (const key of PRESERVED_FIELDS) {
    if (current[key] !== undefined && current[key] !== null && current[key] !== "") body[key] = current[key];
  }
  if (Array.isArray(current.openHours)) body.openHours = current.openHours;
  const members = rows(current.teamMembers, "");
  if (members.length) body.teamMembers = members;

  if (patch.name !== undefined) body.name = patch.name;
  if (patch.active !== undefined) body.isActive = patch.active;
  if (patch.autoConfirm !== undefined) body.autoConfirm = patch.autoConfirm;
  if (patch.hours) body.openHours = toGhlHours(patch.hours);
  if (patch.team) {
    const byId = new Map(members.map((m) => [str(m.userId), m]));
    body.teamMembers = patch.team.map((userId, i) => {
      const kept = byId.get(userId);
      if (kept) return kept;
      return { userId, priority: 1, isPrimary: i === 0 && !members.length };
    });
  }
  if (patch.slotDuration !== undefined) {
    body.slotDuration = patch.slotDuration;
    body.slotDurationUnit = "mins";
  }
  if (patch.slotBuffer !== undefined) {
    body.slotBuffer = patch.slotBuffer;
    body.slotBufferUnit = "mins";
  }
  if (patch.noticeHours !== undefined) {
    body.allowBookingAfter = patch.noticeHours;
    body.allowBookingAfterUnit = "hours";
  }
  if (patch.rangeDays !== undefined) {
    body.allowBookingFor = patch.rangeDays;
    body.allowBookingForUnit = "days";
  }
  // Cleared means "no limit", which GHL stores as blank: leave it unsent.
  if (patch.perDay !== undefined && patch.perDay !== null) body.appoinmentPerDay = patch.perDay;
  return body;
}

// ---------------------------------------------------------------------------
// Pipelines (GET /opportunities/pipelines). GHL has no pipeline write API.
// ---------------------------------------------------------------------------

export const SALES_PIPELINE = "Sales Pipeline";
export const SALES_STAGES = ["Lead", "No Answer", "Estimate Booked", "Job Booked", "Job Completed", "Job/Estimate Cancelled", "Lost", "Follow Up", "Long Term Nurture"];

export interface SetupPipeline {
  id: string;
  name: string;
  stages: string[];
  keep: boolean;
  stagesMatch: boolean;
}

export function shapeSetupPipelines(raw: unknown): SetupPipeline[] {
  return rows(raw, "pipelines").map((p) => {
    const stages = rows(p.stages, "")
      .sort((a, b) => (num(a.position) ?? 0) - (num(b.position) ?? 0))
      .map((s) => str(s.name));
    const keep = str(p.name).toLowerCase() === SALES_PIPELINE.toLowerCase();
    return { id: str(p.id), name: str(p.name), stages, keep, stagesMatch: keep && stages.join("|") === SALES_STAGES.join("|") };
  });
}

// ---------------------------------------------------------------------------
// Media (GET /medias/files, POST /medias/upload-file, POST /medias/folder)
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  name: string;
  url: string;
  type: "file" | "folder";
  size: number | null;
  updatedAt: string;
}

export function shapeMedia(raw: unknown, type: "file" | "folder"): MediaItem[] {
  return rows(raw, "files").map((f) => ({
    id: str(f._id) || str(f.id),
    name: str(f.name),
    url: str(f.url),
    type,
    size: num(f.size),
    updatedAt: str(f.updatedAt) || str(f.createdAt),
  })).filter((f) => f.id);
}

// ---------------------------------------------------------------------------
// Workflows (GET /workflows/). Read only: GHL has no workflow write API.
// ---------------------------------------------------------------------------

export interface SetupWorkflow {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}

export function shapeSetupWorkflows(raw: unknown): SetupWorkflow[] {
  return rows(raw, "workflows")
    .map((w) => ({ id: str(w.id), name: str(w.name), status: str(w.status) || "draft", updatedAt: str(w.updatedAt) }))
    .filter((w) => w.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Phone numbers (GET .../numbers/location/:id, GET .../available, POST .../purchase)
// ---------------------------------------------------------------------------

export interface PhoneNumber {
  number: string;
  name: string;
  type: string;
  isDefault: boolean;
  forwarding: string;
  sms: boolean;
  voice: boolean;
  mms: boolean;
}

export function shapeNumbers(raw: unknown): PhoneNumber[] {
  return rows(raw, "numbers").map((n) => {
    const caps = (n.capabilities ?? {}) as Row;
    return {
      number: str(n.phoneNumber),
      name: str(n.friendlyName),
      type: str(n.type) || "local",
      isDefault: n.isDefaultNumber === true,
      forwarding: str(n.forwardingNumber),
      sms: caps.sms === true || caps.SMS === true,
      voice: caps.voice === true,
      mms: caps.mms === true || caps.MMS === true,
    };
  }).filter((n) => n.number);
}

export interface AvailableNumber {
  number: string;
  label: string;
  locality: string;
  region: string;
  price: number | null;
}

export function shapeAvailable(raw: unknown): { fingerprintId: string; numbers: AvailableNumber[] } {
  const r = (raw ?? {}) as Row;
  return {
    fingerprintId: str(r.fingerprintId),
    numbers: rows(r, "numbers").map((n) => ({
      number: str(n.phoneNumber),
      label: str(n.friendlyName) || str(n.phoneNumber),
      locality: str(n.locality),
      region: str(n.region),
      price: num(((n.price ?? {}) as Row).price),
    })).filter((n) => /^\+1\d{10}$/.test(n.number)),
  };
}

/** GHL's 401 for a scope the install never asked for, said in words Jake can act on. */
export function ghlErrorText(message: string): string {
  if (/not authorized for this scope|scope/i.test(message) && /401|403/.test(message)) {
    return "The GHL app needs reinstalling to allow this (Management > Install app, then Proceed).";
  }
  return `GHL said no: ${message}`;
}
