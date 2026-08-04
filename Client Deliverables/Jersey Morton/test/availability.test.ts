// Run: node --test "worker/test/availability.test.ts"
import test from "node:test";
import assert from "node:assert/strict";

import { dateTimeToUtc, dateInZone, weekdayInZone, addDays, isValidDate } from "../functions/lib/time.ts";
import { slotsForDate, isStillFree, mergeIntervals, overlaps, openWindows } from "../functions/lib/availability.ts";
import { findService, resolveAddons, quote } from "../functions/lib/services.ts";

const TZ = "America/Chicago";
// Tuesdays. One in daylight saving, one outside it.
const SUMMER = "2026-08-11";
const WINTER = "2026-12-08";
const MONDAY = "2026-08-10";
const SATURDAY = "2026-08-15";
const SUNDAY = "2026-08-16";

// Far enough before the day that MIN_NOTICE_HOURS never trims a slot.
const nowBefore = (dateISO: string) => dateTimeToUtc(dateISO, "12:00", TZ) - 7 * 24 * 60 * 60_000;

test("wall clock converts across daylight saving", () => {
  // Central time is UTC-5 in August, UTC-6 in December.
  assert.equal(new Date(dateTimeToUtc(SUMMER, "10:00", TZ)).toISOString(), "2026-08-11T15:00:00.000Z");
  assert.equal(new Date(dateTimeToUtc(WINTER, "10:00", TZ)).toISOString(), "2026-12-08T16:00:00.000Z");
});

test("date and weekday read back in her zone, not UTC", () => {
  // 00:30 local is still the same day, though it is already tomorrow in UTC.
  const lateNight = dateTimeToUtc(SUMMER, "00:30", TZ);
  assert.equal(dateInZone(lateNight, TZ), SUMMER);
  assert.equal(weekdayInZone(lateNight, TZ), 2); // Tuesday
  assert.equal(weekdayInZone(dateTimeToUtc(MONDAY, "12:00", TZ), TZ), 1);
});

test("addDays walks calendar dates", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
});

test("isValidDate rejects impossible dates", () => {
  assert.ok(isValidDate("2026-08-11"));
  assert.ok(!isValidDate("2026-02-30"));
  assert.ok(!isValidDate("11-08-2026"));
  assert.ok(!isValidDate(""));
});

test("the weekend is closed, the working week is not", () => {
  for (const closed of [SATURDAY, SUNDAY]) {
    assert.deepEqual(openWindows(closed, TZ), [], closed);
    assert.equal(slotsForDate({ dateISO: closed, minutes: 90, busy: [], nowMs: nowBefore(closed), tz: TZ }).length, 0, closed);
  }
  // Monday is a working day now.
  assert.ok(slotsForDate({ dateISO: MONDAY, minutes: 90, busy: [], nowMs: nowBefore(MONDAY), tz: TZ }).length > 0);
});

const EVERY_START = [
  "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00",
];

test("the window bounds start times, 13:30 through 18:00 inclusive", () => {
  const slots = slotsForDate({ dateISO: SUMMER, minutes: 90, busy: [], nowMs: nowBefore(SUMMER), tz: TZ });
  assert.deepEqual(slots.map((s) => s.time), EVERY_START);
});

test("a 3 hr service gets the same start times and is allowed to run late", () => {
  const slots = slotsForDate({ dateISO: SUMMER, minutes: 180, busy: [], nowMs: nowBefore(SUMMER), tz: TZ });
  assert.deepEqual(slots.map((s) => s.time), EVERY_START);

  // Booked at the last slot it starts at 18:00 and finishes at 21:00, three
  // hours past the end of the window. 18:00 Central is 23:00 UTC, so the end
  // lands on the following UTC date.
  const last = slots[slots.length - 1];
  assert.equal(last.time, "18:00");
  assert.equal(new Date(last.startIso).toISOString(), "2026-08-11T23:00:00.000Z");
  assert.equal(new Date(last.endIso).toISOString(), "2026-08-12T02:00:00.000Z");
});

test("a slot runs exactly as long as the service", () => {
  const [first] = slotsForDate({ dateISO: SUMMER, minutes: 180, busy: [], nowMs: nowBefore(SUMMER), tz: TZ });
  const mins = (Date.parse(first.endIso) - Date.parse(first.startIso)) / 60_000;
  assert.equal(mins, 180);
});

test("a busy block clears the slots it touches, buffer included", () => {
  // A half hour blocked out mid afternoon.
  const busy = [{
    start: dateTimeToUtc(SUMMER, "16:00", TZ),
    end: dateTimeToUtc(SUMMER, "16:30", TZ),
  }];
  const times = slotsForDate({ dateISO: SUMMER, minutes: 90, busy, nowMs: nowBefore(SUMMER), tz: TZ }).map((s) => s.time);

  // 13:30 ends 15:00, buffered to 15:15. Clear of it.
  // 17:00 starts after the block plus its buffer. Also clear.
  assert.deepEqual(times, ["13:30", "14:00", "17:00", "17:30", "18:00"]);
  // 14:30 ends 16:00, buffered to 16:15. Runs into the block.
  assert.ok(!times.includes("14:30"));
  // 16:30 starts inside the buffer trailing the block.
  assert.ok(!times.includes("16:30"));
});

test("minimum notice trims the near slots, not the far ones", () => {
  // Standing at 08:00 on the day itself, with 12 hours notice required, the
  // earliest bookable moment is 20:00. She shuts at 18:00, so the day is gone.
  const now = dateTimeToUtc(SUMMER, "08:00", TZ);
  const times = slotsForDate({ dateISO: SUMMER, minutes: 90, busy: [], nowMs: now, tz: TZ }).map((s) => s.time);
  assert.equal(times.length, 0);

  // Asking the day before, the whole day is open again.
  const dayBefore = dateTimeToUtc(addDays(SUMMER, -1), "08:00", TZ);
  const next = slotsForDate({ dateISO: SUMMER, minutes: 90, busy: [], nowMs: dayBefore, tz: TZ }).map((s) => s.time);
  assert.ok(next.includes("13:30"));

  // Standing at 03:00 the same morning, the cutoff lands at 15:00 and bisects
  // the day: the early starts go, the later ones stand.
  const cutoff = dateTimeToUtc(SUMMER, "03:00", TZ);
  const trimmed = slotsForDate({ dateISO: SUMMER, minutes: 90, busy: [], nowMs: cutoff, tz: TZ }).map((s) => s.time);
  assert.deepEqual(trimmed, ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"]);
});

test("touching intervals do not count as an overlap", () => {
  assert.ok(!overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }));
  assert.ok(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 }));
});

test("mergeIntervals folds overlapping and nested blocks", () => {
  assert.deepEqual(
    mergeIntervals([
      { start: 30, end: 40 },
      { start: 0, end: 10 },
      { start: 5, end: 8 },
      { start: 8, end: 20 },
    ]),
    [{ start: 0, end: 20 }, { start: 30, end: 40 }],
  );
  assert.deepEqual(mergeIntervals([{ start: 5, end: 5 }]), []);
});

test("isStillFree agrees with the slots that were offered", () => {
  const busy = [{
    start: dateTimeToUtc(SUMMER, "16:00", TZ),
    end: dateTimeToUtc(SUMMER, "16:30", TZ),
  }];
  const now = nowBefore(SUMMER);
  const slots = slotsForDate({ dateISO: SUMMER, minutes: 90, busy, nowMs: now, tz: TZ });

  for (const s of slots) {
    assert.ok(isStillFree(s.startIso, 90, busy, now, TZ), `offered ${s.time} but rejected it`);
  }
  // A start that was never offered.
  const blocked = new Date(dateTimeToUtc(SUMMER, "16:30", TZ)).toISOString();
  assert.ok(!isStillFree(blocked, 90, busy, now, TZ));
  // 13:00 is before she opens.
  const early = new Date(dateTimeToUtc(SUMMER, "13:00", TZ)).toISOString();
  assert.ok(!isStillFree(early, 90, [], now, TZ));
  // Saturday is closed.
  const closed = new Date(dateTimeToUtc(SATURDAY, "14:00", TZ)).toISOString();
  assert.ok(!isStillFree(closed, 90, [], nowBefore(SATURDAY), TZ));
  assert.ok(!isStillFree("not-a-date", 90, [], now, TZ));
});

test("a slot taken in the meantime stops being free", () => {
  const now = nowBefore(SUMMER);
  const start = new Date(dateTimeToUtc(SUMMER, "14:00", TZ)).toISOString();
  assert.ok(isStillFree(start, 90, [], now, TZ));

  const taken = [{
    start: dateTimeToUtc(SUMMER, "14:00", TZ),
    end: dateTimeToUtc(SUMMER, "15:30", TZ),
  }];
  assert.ok(!isStillFree(start, 90, taken, now, TZ));
});

test("a long booking clears the starts it covers, and no more", () => {
  // A 3 hr bleach from 13:30 finishes at 16:30.
  const booked = [{
    start: dateTimeToUtc(SUMMER, "13:30", TZ),
    end: dateTimeToUtc(SUMMER, "16:30", TZ),
  }];
  const left = slotsForDate({ dateISO: SUMMER, minutes: 180, busy: booked, nowMs: nowBefore(SUMMER), tz: TZ })
    .map((s) => s.time);
  // Everything from 13:30 to 16:30 is inside it or inside its buffer. 17:00
  // onwards is clear, and those bookings simply run into the evening.
  assert.deepEqual(left, ["17:00", "17:30", "18:00"]);
});

test("Monday to Friday all run the same hours", () => {
  // 2026-08-10 is a Monday, so this walks one working week.
  for (let i = 0; i < 5; i++) {
    const day = addDays(MONDAY, i);
    const slots = slotsForDate({ dateISO: day, minutes: 180, busy: [], nowMs: nowBefore(day), tz: TZ });
    assert.deepEqual(slots.map((s) => s.time), EVERY_START, day);
  }
});

test("pricing is resolved from ids, never from the request", () => {
  const bleach = findService("bleachTone")!;
  // Toner and gloss are not on offer for a service that already tones.
  const addons = resolveAddons(bleach, ["addHaircut", "addToner", "addGloss"]);
  assert.deepEqual(addons.map((a) => a.id), ["addHaircut"]);
  assert.deepEqual(quote(bleach, addons), { price: 91, minutes: 180, approx: true });

  const correction = findService("colorCorrection")!;
  const all = resolveAddons(correction, ["addHaircut", "addToner", "addGloss"]);
  assert.equal(all.length, 3);
  assert.deepEqual(quote(correction, all), { price: 122, minutes: 180, approx: true });

  assert.equal(findService("nonsense"), null);
  assert.deepEqual(resolveAddons(bleach, "not-an-array"), []);
});
