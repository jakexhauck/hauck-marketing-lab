// Run: node --test "test/hours.test.ts"
//
// Her hours and prices moving out of code and into her own calendar. The risk
// this file exists to cover is a page that quietly closes her book: an empty
// window list, a settings record that fails to parse, a weekly event anchored
// to the wrong weekday.

import test from "node:test";
import assert from "node:assert/strict";

import { dateTimeToUtc } from "../functions/lib/time.ts";
import { slotsForDate, windowsForDate, isStillFree } from "../functions/lib/availability.ts";
import { anchorFor, parseWindows } from "../functions/lib/hoursCalendar.ts";
import { DEFAULT_SETTINGS, decodeSettings, encodeSettings, normalizeSettings } from "../functions/lib/settings.ts";

const TZ = "America/Chicago";
const TUESDAY = "2026-08-11";
const SATURDAY = "2026-08-15";
const nowBefore = (dateISO: string) => dateTimeToUtc(dateISO, "12:00", TZ) - 7 * 24 * 60 * 60_000;

const window = (dateISO: string, from: string, to: string) => ({
  start: dateTimeToUtc(dateISO, from, TZ),
  end: dateTimeToUtc(dateISO, to, TZ),
});

test("windows from the calendar replace the hardcoded hours", () => {
  // 10:00 to 12:00 is nothing like the 13:30 to 18:00 in config.
  const slots = slotsForDate({
    dateISO: TUESDAY,
    minutes: 90,
    busy: [],
    nowMs: nowBefore(TUESDAY),
    windows: [window(TUESDAY, "10:00", "12:00")],
  });
  assert.deepEqual(slots.map((s) => s.time), ["10:00", "10:30", "11:00", "11:30", "12:00"]);
});

test("a day she opened that config calls closed still offers times", () => {
  // Saturday is closed in HOURS. The calendar is the authority now.
  const slots = slotsForDate({
    dateISO: SATURDAY,
    minutes: 90,
    busy: [],
    nowMs: nowBefore(SATURDAY),
    windows: [window(SATURDAY, "09:00", "10:00")],
  });
  assert.deepEqual(slots.map((s) => s.time), ["09:00", "09:30", "10:00"]);
});

test("no windows means no times, and never falls back to config", () => {
  // The distinction that matters: an EMPTY list is "she is closed", a MISSING
  // one is "we do not know, use the fallback". Confusing them either closes her
  // book or opens it when she is away.
  const closed = slotsForDate({
    dateISO: TUESDAY,
    minutes: 90,
    busy: [],
    nowMs: nowBefore(TUESDAY),
    windows: [],
  });
  assert.equal(closed.length, 0);

  const fallback = slotsForDate({
    dateISO: TUESDAY,
    minutes: 90,
    busy: [],
    nowMs: nowBefore(TUESDAY),
  });
  assert.ok(fallback.length > 0, "a missing window list must use the hardcoded hours");
});

test("split shifts keep their gap", () => {
  const slots = slotsForDate({
    dateISO: TUESDAY,
    minutes: 30,
    busy: [],
    nowMs: nowBefore(TUESDAY),
    windows: [window(TUESDAY, "09:00", "10:00"), window(TUESDAY, "14:00", "15:00")],
  });
  assert.deepEqual(slots.map((s) => s.time), ["09:00", "09:30", "10:00", "14:00", "14:30", "15:00"]);
});

test("a window running past midnight is clipped to its own day", () => {
  // Google can hand back an event that crosses midnight. Unclipped it would
  // offer 1am start times on a day she never opened.
  const overnight = {
    start: dateTimeToUtc(TUESDAY, "22:00", TZ),
    end: dateTimeToUtc("2026-08-12", "03:00", TZ),
  };
  const clipped = windowsForDate(TUESDAY, [overnight], TZ);
  assert.equal(clipped.length, 1);
  assert.equal(new Date(clipped[0].end).toISOString(), new Date(dateTimeToUtc("2026-08-12", "00:00", TZ)).toISOString());
});

test("busy still closes a slot inside a calendar window", () => {
  const slots = slotsForDate({
    dateISO: TUESDAY,
    minutes: 60,
    busy: [{ start: dateTimeToUtc(TUESDAY, "10:00", TZ), end: dateTimeToUtc(TUESDAY, "11:00", TZ) }],
    nowMs: nowBefore(TUESDAY),
    windows: [window(TUESDAY, "09:00", "12:00")],
  });
  assert.ok(!slots.some((s) => s.time === "09:30"), "an appointment ending inside the busy block was offered");
  assert.ok(!slots.some((s) => s.time === "10:00"));
  assert.ok(slots.some((s) => s.time === "11:30"), "the slot after the busy block should be free");
});

test("the booking re-check sees the same windows the page did", () => {
  const windows = [window(SATURDAY, "09:00", "10:00")];
  const startIso = new Date(dateTimeToUtc(SATURDAY, "09:30", TZ)).toISOString();

  // Saturday is closed in config, so without the windows this must refuse.
  assert.equal(isStillFree(startIso, 60, [], nowBefore(SATURDAY), TZ), false);
  assert.equal(isStillFree(startIso, 60, [], nowBefore(SATURDAY), TZ, { windows }), true);
});

test("a longer buffer closes more around an appointment", () => {
  const busy = [{ start: dateTimeToUtc(TUESDAY, "11:00", TZ), end: dateTimeToUtc(TUESDAY, "12:00", TZ) }];
  const opts = {
    dateISO: TUESDAY,
    minutes: 60,
    busy,
    nowMs: nowBefore(TUESDAY),
    windows: [window(TUESDAY, "09:00", "13:00")],
  };
  const tight = slotsForDate({ ...opts, bufferMinutes: 0 }).map((s) => s.time);
  const roomy = slotsForDate({ ...opts, bufferMinutes: 60 }).map((s) => s.time);

  assert.ok(tight.includes("10:00"), "a 10:00 to 11:00 appointment fits with no buffer");
  assert.ok(!roomy.includes("10:00"), "an hour of buffer should have closed it");
});

test("notice and step come from settings", () => {
  const at = dateTimeToUtc(TUESDAY, "09:00", TZ);
  const opts = {
    dateISO: TUESDAY,
    minutes: 30,
    busy: [],
    windows: [window(TUESDAY, "09:00", "10:00")],
  };
  // Standing at 09:00 on the day, a 12 hour notice leaves nothing.
  assert.equal(slotsForDate({ ...opts, nowMs: at, minNoticeHours: 12 }).length, 0);
  assert.ok(slotsForDate({ ...opts, nowMs: at, minNoticeHours: 0 }).length > 0);

  const quarterly = slotsForDate({ ...opts, nowMs: nowBefore(TUESDAY), stepMinutes: 15 });
  assert.ok(quarterly.some((s) => s.time === "09:15"), "a 15 minute step should offer quarter hours");
});

test("the weekly anchor lands on the weekday it claims", () => {
  // 2026-08-11 is a Tuesday. Sunday is 0.
  assert.equal(anchorFor("2026-08-11", 2), "2026-08-11");
  assert.equal(anchorFor("2026-08-11", 3), "2026-08-12");
  assert.equal(anchorFor("2026-08-11", 1), "2026-08-17");
  assert.equal(anchorFor("2026-08-11", 0), "2026-08-16");
});

test("all-day and malformed events are not open windows", () => {
  const parsed = parseWindows([
    { start: { dateTime: "2026-08-11T13:30:00-05:00" }, end: { dateTime: "2026-08-11T18:00:00-05:00" } },
    { start: { date: "2000-01-01" }, end: { date: "2000-01-02" } }, // the settings record
    { start: { dateTime: "nonsense" }, end: { dateTime: "also nonsense" } },
    { start: { dateTime: "2026-08-11T18:00:00-05:00" }, end: { dateTime: "2026-08-11T13:30:00-05:00" } },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(new Date(parsed[0].start).toISOString(), "2026-08-11T18:30:00.000Z");
});

test("settings fall back to the defaults rather than to nothing", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ services: "not a list" }).services.length, DEFAULT_SETTINGS.services.length);
});

test("a saved price is kept and an absurd one is clamped", () => {
  const saved = normalizeSettings({
    services: [{ id: "haircut", name: "Haircut", price: 25, minutes: 60 }],
    bufferMinutes: 30,
  });
  const cut = saved.services.find((s) => s.id === "haircut")!;
  assert.equal(cut.price, 25);
  assert.equal(cut.minutes, 60);
  assert.equal(saved.bufferMinutes, 30);

  const silly = normalizeSettings({
    services: [{ id: "haircut", price: -40, minutes: 100000 }],
    horizonDays: 5000,
    minNoticeHours: -1,
  });
  const clamped = silly.services.find((s) => s.id === "haircut")!;
  assert.equal(clamped.price, 0);
  assert.equal(clamped.minutes, 8 * 60);
  assert.equal(silly.horizonDays, 365);
  assert.equal(silly.minNoticeHours, 0);
});

test("the form cannot invent, rename away or drop a service", () => {
  // Ids are what past bookings and the page's markup refer to.
  const out = normalizeSettings({
    services: [
      { id: "haircut", name: "Haircut", price: 20, minutes: 90 },
      { id: "free-everything", name: "Free everything", price: 0, minutes: 15 },
    ],
  });
  assert.equal(out.services.length, DEFAULT_SETTINGS.services.length);
  assert.ok(!out.services.some((s) => s.id === "free-everything"), "an invented service was accepted");
  assert.ok(out.services.some((s) => s.id === "bleachTone"), "a service she did not mention was dropped");
});

// Google caps one extendedProperties value at 1024 characters and TRUNCATES
// past it while returning 200. The settings JSON is longer than that, so the
// first version of this stored broken JSON, read it back as the defaults, and
// told her it had saved. Every price she set silently did nothing.
test("no stored chunk is long enough for Google to truncate", () => {
  const priv = encodeSettings(DEFAULT_SETTINGS);
  for (const [key, value] of Object.entries(priv)) {
    if (value === null) continue;
    assert.ok(value.length <= 1024, `${key} is ${value.length} characters, Google keeps 1024`);
  }
});

test("settings survive the round trip through chunks", () => {
  const changed = normalizeSettings({
    services: DEFAULT_SETTINGS.services.map((s) => ({ ...s, price: s.price + 7, minutes: 120 })),
    bufferMinutes: 25,
    horizonDays: 90,
  });
  const priv = encodeSettings(changed);
  assert.ok(Number(priv.jmParts) > 1, "the whole point is that this does not fit in one property");

  const decoded = decodeSettings(priv as Record<string, string>);
  assert.deepEqual(decoded, changed);
});

test("a truncated record reads as nothing, not as half a business", () => {
  const priv = encodeSettings(DEFAULT_SETTINGS) as Record<string, string>;
  const parts = Number(priv.jmParts);
  // Exactly what Google did: the last chunk lost.
  delete priv[`jmSettings${parts - 1}`];
  assert.equal(decodeSettings(priv), null);

  // And the old single-key shape, cut off mid-JSON.
  assert.equal(decodeSettings({ jmKind: "settings", jmSettings: '{"services":[{"id":"hairc' }), null);
});

test("shrinking the settings clears the chunks it no longer needs", () => {
  const priv = encodeSettings(DEFAULT_SETTINGS);
  const parts = Number(priv.jmParts);
  // Null is what removes a key on PATCH. Without these, a shorter save would
  // leave old chunks behind and the next read would splice them onto the end.
  assert.equal(priv[`jmSettings${parts}`], null);
  assert.equal(priv.jmSettings11, null);
});

test("an empty or absent record reads as nothing", () => {
  assert.equal(decodeSettings(undefined), null);
  assert.equal(decodeSettings({}), null);
  assert.equal(decodeSettings({ jmKind: "settings", jmParts: "0" }), null);
});

test("a service that includes tone still refuses toner add-ons", () => {
  const settings = normalizeSettings({});
  const bleach = settings.services.find((s) => s.id === "bleachTone")!;
  assert.ok(bleach.includesTone, "the flag must survive normalising");
});
