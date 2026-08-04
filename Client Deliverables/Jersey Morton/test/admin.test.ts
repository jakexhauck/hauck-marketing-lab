// Run: node --test "test/admin.test.ts"
//
// The admin surface can close her book, so the interesting cases are the ones
// where it should refuse: a bad session, a schedule that overlaps itself, a
// time that is not a time.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { constantTimeEqual, issueSession, readCookie, sessionIsValid } from "../functions/lib/adminAuth.ts";
import { parseWeekly } from "../functions/api/admin/schedule.ts";

const env = { ADMIN_KEY: "a-long-random-admin-key", HOURS_PASSCODE: "hunter2" };
const NOW = Date.parse("2026-08-04T12:00:00Z");

test("constant time compare still gets the answer right", () => {
  assert.equal(constantTimeEqual("hunter2", "hunter2"), true);
  assert.equal(constantTimeEqual("hunter2", "hunter3"), false);
  assert.equal(constantTimeEqual("hunter2", "hunter2 "), false);
  assert.equal(constantTimeEqual("", ""), true);
  assert.equal(constantTimeEqual("short", "muchlongervalue"), false);
});

test("a session it issued is one it accepts", async () => {
  const token = await issueSession(env, NOW);
  assert.equal(await sessionIsValid(env, token, NOW), true);
});

test("a session expires, and cannot be extended by editing it", async () => {
  const token = await issueSession(env, NOW);
  const [expires, signature] = token.split(".");

  assert.equal(await sessionIsValid(env, token, NOW + 31 * 24 * 3600_000), false);

  // Push the expiry out by hand: the signature no longer covers it.
  const forged = `${Number(expires) + 10 * 24 * 3600_000}.${signature}`;
  assert.equal(await sessionIsValid(env, forged, NOW), false);
});

test("a session signed with a different key is refused", async () => {
  const token = await issueSession({ ADMIN_KEY: "someone elses key" }, NOW);
  assert.equal(await sessionIsValid(env, token, NOW), false);
});

test("nonsense in the cookie is refused rather than thrown at", async () => {
  for (const bad of [null, "", "no-dot", "abc.def", "..", `${NOW + 1000}.`]) {
    assert.equal(await sessionIsValid(env, bad as string | null, NOW), false);
  }
});

test("with no ADMIN_KEY nothing is ever valid", async () => {
  const token = await issueSession(env, NOW);
  assert.equal(await sessionIsValid({}, token, NOW), false);
});

test("the session cookie is picked out of a crowd", () => {
  assert.equal(readCookie("a=1; jm_hours=tok3n; b=2"), "tok3n");
  assert.equal(readCookie("jm_hours=tok3n"), "tok3n");
  assert.equal(readCookie("other=1"), null);
  assert.equal(readCookie(null), null);
});

test("a good week is accepted", () => {
  const out = parseWeekly([
    { weekday: 1, from: "13:30", to: "18:00" },
    { weekday: 2, from: "09:00", to: "12:00" },
    { weekday: 2, from: "13:00", to: "17:00" },
  ]);
  assert.ok("windows" in out);
  assert.equal(out.windows.length, 3);
});

test("a week that overlaps itself is refused", () => {
  // Two windows covering the same hour would offer the same start time twice.
  const out = parseWeekly([
    { weekday: 2, from: "09:00", to: "13:00" },
    { weekday: 2, from: "12:00", to: "17:00" },
  ]);
  assert.ok("error" in out);
  assert.match(out.error, /overlap/i);
});

test("windows that touch end to end are fine", () => {
  const out = parseWeekly([
    { weekday: 2, from: "09:00", to: "12:00" },
    { weekday: 2, from: "12:00", to: "17:00" },
  ]);
  assert.ok("windows" in out);
});

test("a backwards or malformed window is refused", () => {
  assert.ok("error" in parseWeekly([{ weekday: 1, from: "18:00", to: "13:30" }]));
  assert.ok("error" in parseWeekly([{ weekday: 1, from: "13:30", to: "13:30" }]));
  assert.ok("error" in parseWeekly([{ weekday: 1, from: "25:00", to: "26:00" }]));
  assert.ok("error" in parseWeekly([{ weekday: 1, from: "1:30", to: "18:00" }]));
  assert.ok("error" in parseWeekly([{ weekday: 7, from: "13:30", to: "18:00" }]));
  assert.ok("error" in parseWeekly([{ from: "13:30", to: "18:00" }]));
  assert.ok("error" in parseWeekly("not a list"));
});

test("an empty week is allowed, because closing for a fortnight is a real thing", () => {
  const out = parseWeekly([]);
  assert.ok("windows" in out);
  assert.equal(out.windows.length, 0);
});

const html = readFileSync(new URL("../public/hours.html", import.meta.url), "utf8");

test("the hours page's own script parses", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, "no inline script found");
  for (const [, code] of scripts) new vm.Script(code);
});

test("the hours page carries no em dashes", () => {
  assert.equal((html.match(/[—–]/g) ?? []).length, 0);
});

test("the hours page keeps search engines out", () => {
  assert.match(html, /name="robots"\s+content="noindex/);
});

test("the hours page reads its Turnstile token before the render that clears it", () => {
  // The same bug that stopped the booking page working. It would lock her out
  // of her own hours instead.
  const from = html.indexOf("async function signIn()");
  assert.ok(from > -1);
  const body = html.slice(from, html.indexOf("function loginHtml()", from));
  const captured = body.indexOf("const token = tsToken");
  const paints = body.indexOf("busy = true");
  assert.ok(captured > -1 && captured < paints, "the token is read after the render that clears it");
  assert.ok(body.includes("turnstileToken: token"));
});

test("the hours page warns rather than silently closing her book", () => {
  assert.ok(html.includes("Nobody can book you"), "no warning for a week with nothing open");
  assert.ok(html.includes("openNothing"), "the server's warning is never read");
});
