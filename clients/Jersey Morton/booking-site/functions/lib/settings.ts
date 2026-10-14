// Everything about her business that is not a time: prices, service lengths,
// the buffer, the notice, the horizon.
//
// Stored as JSON in the extendedProperties of a single all-day event in the
// year 2000 on the Booking hours calendar. That sounds odd until you remember
// this build has no database on purpose, and the Cloudflare token cannot create
// a KV namespace. Extended properties are invisible in the Google UI, so she
// cannot corrupt the values by editing the event, and the record is fetched by
// privateExtendedProperty rather than by scanning her calendar.
//
// readSettings and writeSettings are the entire interface. Moving this to KV
// later touches this file and nothing else.

import {
  BUFFER_MINUTES,
  BOOKING_HORIZON_DAYS,
  MIN_NOTICE_HOURS,
  SLOT_STEP_MINUTES,
} from "./config.ts";
import { type Addon, ADDONS, type Service, SERVICES } from "./services.ts";
import { type Env, proxyCall } from "./composio.ts";

export interface Settings {
  services: Service[];
  addons: Addon[];
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  slotStepMinutes: number;
}

// What the page runs on before she has ever saved anything, and what it falls
// back to if the record is missing or unreadable.
export const DEFAULT_SETTINGS: Settings = {
  services: SERVICES,
  addons: ADDONS,
  bufferMinutes: BUFFER_MINUTES,
  minNoticeHours: MIN_NOTICE_HOURS,
  horizonDays: BOOKING_HORIZON_DAYS,
  slotStepMinutes: SLOT_STEP_MINUTES,
};

const SETTINGS_EVENT_TITLE = "Booking settings (do not delete)";

// Google caps a single extendedProperties value at 1024 characters and does not
// complain when you exceed it: it stores the first 1024 and returns 200. The
// settings JSON is about 1100, so the first version of this saved successfully,
// read back as broken JSON, and silently fell through to the defaults. Every
// price she set looked saved and did nothing.
//
// So the JSON is split across numbered keys with a count alongside it. 900
// leaves room for the cap to be measured in bytes rather than characters
// somewhere in the stack.
const CHUNK = 900;
// Enough for roughly 10KB of settings, and the ceiling on how many stale keys
// are cleared when a save gets shorter.
const MAX_CHUNKS = 12;

export function encodeSettings(value: Settings): Record<string, string | null> {
  const json = JSON.stringify(value);
  const out: Record<string, string | null> = { jmKind: "settings" };
  let parts = 0;
  for (let i = 0; i < json.length; i += CHUNK) {
    out[`jmSettings${parts}`] = json.slice(i, i + CHUNK);
    parts++;
  }
  if (parts > MAX_CHUNKS) throw new Error("settings too large to store");
  out.jmParts = String(parts);
  // Null removes a key on PATCH. Without this, shrinking the settings would
  // leave a tail of old chunks behind, and the next read would splice them on.
  for (let i = parts; i < MAX_CHUNKS; i++) out[`jmSettings${i}`] = null;
  return out;
}

// Returns null rather than throwing: an unreadable record means the defaults,
// which is a working business, not a broken page.
export function decodeSettings(priv: Record<string, string> | undefined): Settings | null {
  if (!priv) return null;
  try {
    const parts = Number(priv.jmParts);
    if (Number.isInteger(parts) && parts > 0) {
      let json = "";
      for (let i = 0; i < parts; i++) {
        const piece = priv[`jmSettings${i}`];
        // A missing chunk means a partial write. Half a settings object parsed
        // by luck would be worse than the defaults.
        if (typeof piece !== "string") return null;
        json += piece;
      }
      return normalizeSettings(JSON.parse(json));
    }
    // The single-key shape this used to write, kept so an old record still
    // reads. Anything truncated fails the parse and falls back.
    if (typeof priv.jmSettings === "string") return normalizeSettings(JSON.parse(priv.jmSettings));
    return null;
  } catch {
    return null;
  }
}

// Bounds, not preferences. A typo in a form should not be able to close her
// book for a year or let someone book a 40 hour appointment.
const LIMITS = {
  price: { min: 0, max: 10_000 },
  minutes: { min: 15, max: 8 * 60 },
  buffer: { min: 0, max: 120 },
  notice: { min: 0, max: 30 * 24 },
  horizon: { min: 1, max: 365 },
  step: { min: 5, max: 120 },
};

function clamp(value: unknown, fallback: number, range: { min: number; max: number }): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, range.min), range.max);
}

function text(value: unknown, fallback: string, max = 60): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/\s+/g, " ").trim().slice(0, max);
  return clean || fallback;
}

// Anything stored or submitted is merged over the defaults rather than trusted.
//
// Services are matched to the built-in list BY ID and unknown ids are dropped.
// Ids are what past bookings and the page's own markup refer to, so letting the
// admin form invent or rename them would break both. She can change what a
// service costs and how long it takes, not what exists.
export function normalizeSettings(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;

  const services = SERVICES.map((base) => {
    const saved = Array.isArray(input.services)
      ? (input.services as Service[]).find((s) => s?.id === base.id)
      : undefined;
    if (!saved) return base;
    return {
      ...base,
      name: text(saved.name, base.name),
      price: clamp(saved.price, base.price, LIMITS.price),
      minutes: clamp(saved.minutes, base.minutes, LIMITS.minutes),
    };
  });

  const addons = ADDONS.map((base) => {
    const saved = Array.isArray(input.addons)
      ? (input.addons as Addon[]).find((a) => a?.id === base.id)
      : undefined;
    if (!saved) return base;
    return {
      ...base,
      name: text(saved.name, base.name),
      price: clamp(saved.price, base.price, LIMITS.price),
    };
  });

  return {
    services,
    addons,
    bufferMinutes: clamp(input.bufferMinutes, DEFAULT_SETTINGS.bufferMinutes, LIMITS.buffer),
    minNoticeHours: clamp(input.minNoticeHours, DEFAULT_SETTINGS.minNoticeHours, LIMITS.notice),
    horizonDays: clamp(input.horizonDays, DEFAULT_SETTINGS.horizonDays, LIMITS.horizon),
    slotStepMinutes: clamp(input.slotStepMinutes, DEFAULT_SETTINGS.slotStepMinutes, LIMITS.step),
  };
}

// One extra round trip on the hot path is worth avoiding. Workers reuse an
// isolate across requests, so a short TTL cuts most of them without ever
// serving her a price she changed a minute ago.
const CACHE_MS = 60_000;
let cache: { at: number; value: Settings } | null = null;

export function forgetSettingsCache(): void {
  cache = null;
}

interface SettingsRecord {
  id?: string;
  extendedProperties?: { private?: Record<string, string> };
}

async function findRecord(env: Env, accountId: string, calendarId: string): Promise<SettingsRecord | null> {
  const qs = new URLSearchParams({ privateExtendedProperty: "jmKind=settings", maxResults: "2" });
  const res = await proxyCall<{ items?: SettingsRecord[] }>(env, {
    connectedAccountId: accountId,
    endpoint: `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
    method: "GET",
  });
  return (res?.items ?? [])[0] ?? null;
}

// Never throws. Her prices being briefly stale is a smaller problem than the
// booking page refusing to load, and the defaults are always a valid business.
export async function readSettings(env: Env, accountId: string, calendarId: string | null): Promise<Settings> {
  if (!calendarId) return DEFAULT_SETTINGS;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  try {
    const record = await findRecord(env, accountId, calendarId);
    const value = decodeSettings(record?.extendedProperties?.private) ?? DEFAULT_SETTINGS;
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(
  env: Env,
  accountId: string,
  calendarId: string,
  raw: unknown,
): Promise<Settings> {
  const value = normalizeSettings(raw);
  const body = {
    summary: SETTINGS_EVENT_TITLE,
    // Far enough in the past that it never appears in anything she looks at.
    start: { date: "2000-01-01" },
    end: { date: "2000-01-02" },
    transparency: "transparent",
    extendedProperties: { private: encodeSettings(value) },
  };

  const existing = await findRecord(env, accountId, calendarId);
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
  await proxyCall(env, {
    connectedAccountId: accountId,
    endpoint: existing?.id ? `${path}/${encodeURIComponent(existing.id)}` : path,
    method: existing?.id ? "PATCH" : "POST",
    body,
  });

  // Read it back rather than trusting the write. Google accepts an oversized
  // property and truncates it silently, which is exactly how this went wrong
  // the first time: saved, reported success, stored nonsense.
  const stored = decodeSettings((await findRecord(env, accountId, calendarId))?.extendedProperties?.private);
  if (!stored || JSON.stringify(stored) !== JSON.stringify(value)) {
    throw new Error("settings did not store correctly");
  }

  cache = { at: Date.now(), value };
  return value;
}

// Priced from the stored settings, never from the request body. Same guarantee
// the hardcoded version gave: a tampered request cannot book a 3 hr bleach at
// blowout prices.
export function findServiceIn(settings: Settings, id: unknown): Service | null {
  return settings.services.find((s) => s.id === id) ?? null;
}

export function allowedAddonsIn(settings: Settings, service: Service): Addon[] {
  return settings.addons.filter((a) => !(a.needsTone && service.includesTone));
}

export function resolveAddonsIn(settings: Settings, service: Service, ids: unknown): Addon[] {
  if (!Array.isArray(ids)) return [];
  return allowedAddonsIn(settings, service).filter((a) => ids.includes(a.id));
}

export function quoteIn(service: Service, addons: Addon[]): { price: number; minutes: number; approx: boolean } {
  return {
    price: service.price + addons.reduce((n, a) => n + a.price, 0),
    minutes: service.minutes + addons.reduce((n, a) => n + a.minutes, 0),
    approx: Boolean(service.approx),
  };
}
