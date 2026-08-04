// Run: node --test "test/notify.test.ts"
//
// What Jersey's phone ends up saying. The risky part is the time: the payload
// is built from an instant, and if it is formatted in the wrong zone she drives
// to the salon five hours early.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookingNotice,
  notifyConfigured,
  sendBookingNotice,
  splitName,
  toE164,
} from "../functions/lib/notify.ts";

const base = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "3135550134",
  service: "Bleach and tone",
  addons: ["Add a haircut"],
  estimate: 91,
  estimateIsApprox: true,
  minutes: 180,
  // 18:00 Central on Friday 2 October.
  startIso: "2026-10-02T23:00:00.000Z",
  notes: "Going lighter than last time",
  reference: "ref-123",
  eventId: "ev-123",
};

test("the time is hers, not UTC", () => {
  const out = buildBookingNotice(base);
  assert.equal(out.start_day, "Friday 2 October");
  assert.equal(out.start_time, "6:00 pm");
  assert.equal(out.timezone, "America/Chicago");
  // The exact instant survives too, for anything doing date maths.
  assert.equal(out.start_iso, "2026-10-02T23:00:00.000Z");
});

test("the ready made sentence has everything she needs to act", () => {
  const { message } = buildBookingNotice(base);
  for (const needed of ["Jane Doe", "Friday 2 October", "6:00 pm", "Bleach and tone", "Add a haircut", "3 hr", "$91+", "3135550134"]) {
    assert.ok(message.includes(needed), `the text never mentions ${needed}: ${message}`);
  }
});

test("an add-on is reported as text, as a display line and as a flag", () => {
  const withAddon = buildBookingNotice(base);
  assert.equal(withAddon.addons, "Add a haircut");
  assert.equal(withAddon.addons_display, "Add a haircut");
  assert.equal(withAddon.has_addons, "yes");

  const without = buildBookingNotice({ ...base, addons: [] });
  assert.equal(without.addons, "", "a custom field should stay empty, not hold the word None");
  assert.equal(without.addons_display, "None", "a labelled SMS line must never trail off into nothing");
  assert.equal(without.has_addons, "no");
  assert.ok(!without.message.includes("plus"), "an empty add-on list should not read as 'plus'");
});

test("the day and time come as one line as well as two", () => {
  const out = buildBookingNotice(base);
  assert.equal(out.start_when, "Friday 2 October at 6:00 pm");
  assert.equal(out.start_when, `${out.start_day} at ${out.start_time}`);
});

test("an exact price is not dressed up as an estimate", () => {
  const exact = buildBookingNotice({ ...base, estimate: 14, estimateIsApprox: false });
  assert.equal(exact.estimate_display, "$14");
  assert.equal(exact.estimate_is_approx, "no");
});

test("every value is a string, because merge tags are", () => {
  for (const [key, value] of Object.entries(buildBookingNotice(base))) {
    assert.equal(typeof value, "string", `${key} is not a string`);
  }
});

test("missing notes do not become the word undefined", () => {
  const out = buildBookingNotice({ ...base, notes: undefined });
  assert.equal(out.notes, "");
  assert.ok(!out.message.includes("undefined"));
});

// GoHighLevel takes a first and last name, and splits a single field itself if
// you let it. Doing it here means the same split every time.
test("a name splits into something a contact record can take", () => {
  assert.deepEqual(splitName("Jane Doe"), { first: "Jane", last: "Doe" });
  assert.deepEqual(splitName("Mary Jane Watson"), { first: "Mary", last: "Jane Watson" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
  assert.deepEqual(splitName("  Jane   Doe  "), { first: "Jane", last: "Doe" });
  assert.deepEqual(splitName(""), { first: "", last: "" });
});

// It cannot text anyone without E.164, but guessing a country code onto a
// number we do not understand is worse than passing it through.
test("a phone number becomes dialable where we can be sure", () => {
  assert.equal(toE164("3135550134"), "+13135550134");
  assert.equal(toE164("(313) 555 0134"), "+13135550134");
  assert.equal(toE164("13135550134"), "+13135550134");
  assert.equal(toE164("+44 20 7946 0018"), "+442079460018");
  assert.equal(toE164("5550134"), "5550134", "a number we cannot place must not be given +1");
  assert.equal(toE164(""), "");
});

test("the contact fields are on the payload", () => {
  const out = buildBookingNotice(base);
  assert.equal(out.first_name, "Jane");
  assert.equal(out.last_name, "Doe");
  assert.equal(out.phone_e164, "+13135550134");
  assert.equal(out.phone, "3135550134", "the number as typed is kept too");
});

test("with no webhook set it does nothing and says so", async () => {
  assert.equal(notifyConfigured({}), false);
  assert.equal(await sendBookingNotice({}, base), false);
});

// The whole reason this is fire and forget: the appointment is already in her
// calendar and the client already has the invite.
test("a webhook that fails never throws at the booking", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (() => Promise.reject(new Error("GoHighLevel is down"))) as typeof fetch;
    assert.equal(await sendBookingNotice({ BOOKING_WEBHOOK_URL: "https://example.com/hook" }, base), false);

    globalThis.fetch = (() => Promise.resolve(new Response("no", { status: 500 }))) as typeof fetch;
    assert.equal(await sendBookingNotice({ BOOKING_WEBHOOK_URL: "https://example.com/hook" }, base), false);

    globalThis.fetch = (() => Promise.resolve(new Response("ok", { status: 200 }))) as typeof fetch;
    assert.equal(await sendBookingNotice({ BOOKING_WEBHOOK_URL: "https://example.com/hook" }, base), true);
  } finally {
    globalThis.fetch = original;
  }
});

test("the webhook url is never hardcoded in the source", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../functions/lib/notify.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!/leadconnectorhq|hooks\/[A-Za-z0-9]{10,}/.test(src), "a live webhook url is committed in the source");
});
