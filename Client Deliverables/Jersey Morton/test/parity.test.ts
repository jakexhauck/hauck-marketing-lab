// index.html carries its own copy of the service list so the page can render
// before the API answers. Duplication is deliberate; drift is not. If this
// fails, the page is quoting a price or a length the worker will not honour.
//
// Run: node --test "test/parity.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ADDONS, SERVICES } from "../functions/lib/services.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "public", "index.html");
const html = fs.readFileSync(PAGE, "utf8");

// Pulls a top-level `const NAME = <literal>;` out of the page and evaluates it.
function readLiteral(name: string): unknown {
  const match = html.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
  assert.ok(match, `index.html no longer declares ${name}`);
  return vm.runInNewContext(`(${match![1]})`);
}

interface PageService {
  id: string; name: string; price: number; minutes: number;
  approx?: boolean; includesTone?: boolean;
}

const pageServices = readLiteral("SERVICES") as Record<string, PageService[]>;
// Spread into arrays built in THIS realm. Values evaluated inside a vm context
// carry that context's Array prototype, and deepEqual compares prototypes.
const pageAddons = [...(readLiteral("ADDONS") as { id: string; name: string; price: number; minutes: number; needsTone?: boolean }[])];
const flatPage = [...pageServices.cut, ...pageServices.color];

test("the page lists exactly the services the worker will accept", () => {
  assert.deepEqual(flatPage.map((s) => s.id), SERVICES.map((s) => s.id));
});

test("every service agrees on name, price and length", () => {
  for (const worker of SERVICES) {
    const page = flatPage.find((s) => s.id === worker.id)!;
    assert.equal(page.name, worker.name, `${worker.id}: name`);
    assert.equal(page.price, worker.price, `${worker.id}: price`);
    assert.equal(page.minutes, worker.minutes, `${worker.id}: minutes`);
    assert.equal(Boolean(page.approx), Boolean(worker.approx), `${worker.id}: approx`);
    assert.equal(Boolean(page.includesTone), Boolean(worker.includesTone), `${worker.id}: includesTone`);
  }
});

test("add-ons agree, including which ones need tone", () => {
  assert.deepEqual(pageAddons.map((a) => a.id), ADDONS.map((a) => a.id));
  for (const worker of ADDONS) {
    const page = pageAddons.find((a) => a.id === worker.id)!;
    assert.equal(page.name, worker.name, `${worker.id}: name`);
    assert.equal(page.price, worker.price, `${worker.id}: price`);
    assert.equal(page.minutes, worker.minutes, `${worker.id}: minutes`);
    assert.equal(Boolean(page.needsTone), Boolean(worker.needsTone), `${worker.id}: needsTone`);
  }
});

// She can change a price from /hours now, so the list in the page is the thing
// that paints first, not the thing that is true. It still has to match the code
// defaults, because that is what the server falls back to.
test("the page corrects its built-in prices from the API", () => {
  assert.ok(html.includes("function applyLivePrices"), "the page never reconciles its prices");
  assert.ok(html.includes("applyLivePrices(cfg.services, cfg.addons)"), "config is fetched but the prices are ignored");
  // A changed length invalidates slots already fetched for the old one.
  const from = html.indexOf("function applyLivePrices");
  const body = html.slice(from, html.indexOf("function mountTurnstile", from));
  assert.ok(body.includes("resetSlots()"), "a changed length must drop the slots sized for the old one");
});

test("the page carries no em dashes", () => {
  assert.equal((html.match(/[—–]/g) ?? []).length, 0);
});

test("the page's own script parses", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, "no inline script found");
  for (const [, code] of scripts) new vm.Script(code);
});

test("nothing GoHighLevel is left in the page", () => {
  for (const trace of ["leadconnector", "msgsndr", "gohighlevel", "GHL_CALENDAR", "form_embed"]) {
    assert.ok(!html.toLowerCase().includes(trace.toLowerCase()), `index.html still mentions ${trace}`);
  }
});

test("the card only pre-frame survives, on the estimate and on the booking screen", () => {
  assert.ok(html.includes("const PAYMENT_METHOD = 'Card only'"));
  // Once beside the estimate, once on the strip above the times, once on the
  // confirmation. Losing any of them loses the pre-frame.
  assert.ok((html.match(/\$\{PAYMENT_METHOD\}/g) ?? []).length >= 3);
  assert.ok(html.includes("This is an estimate"));
});

test("the booking page loads the Turnstile widget", () => {
  assert.ok(html.includes("challenges.cloudflare.com/turnstile/v0/api.js"), "widget script missing");
  assert.ok(html.includes('id="ts-box"'), "no container for the widget");
});

// This is the bug that meant the page could not book anybody, and the earlier
// version of this test asserted the broken line as if it were correct.
// submitBooking calls render() before it builds the request; render() remounts
// the widget; mounting clears state.tsToken. So reading the token after that
// render sent null every time and the server refused with a 403.
test("the booking sends the token it captured, not one the render has cleared", () => {
  const from = html.indexOf("async function submitBooking()");
  assert.ok(from > -1, "submitBooking is gone");
  const body = html.slice(from, html.indexOf("function validateClient()", from));

  const captured = body.indexOf("const token = state.tsToken");
  const paints = body.indexOf("submitting = true");
  assert.ok(captured > -1, "the token is never captured before the render");
  assert.ok(captured < paints, "the token is read after the render that clears it: every booking 403s");
  assert.ok(body.includes("turnstileToken: token"), "the captured token is not the one being sent");
  assert.ok(!body.includes("turnstileToken: state.tsToken"), "sends the live token, which the render nulled");
});

test("the widget is not remounted while a booking is in flight", () => {
  assert.ok(
    html.includes("if (step === 'details' && !submitting) mountTurnstile();"),
    "a mid-submit render would spend a fresh token for nothing",
  );
});

// Her times are Central. Deriving them from a Date in the browser's own zone
// showed a client one state over the wrong hour, and one abroad the wrong day.
test("times are shown in the salon's timezone, never the browser's", () => {
  assert.ok(!/\.getHours\(\)/.test(html), "a screen still formats time in the browser's zone");
  assert.ok(html.includes("timeZone: salonTz"), "salonParts is not pinned to the salon timezone");
  assert.ok(html.includes("salonTz = cfg.timezone"), "the timezone never comes from the API");
});

// One request covers a fortnight, she books 60 days out. Without a way to step
// forward, a stylist busy for two weeks is a page that can never be booked.
test("the client can reach past the first fortnight", () => {
  assert.ok(html.includes('data-window='), "no control for stepping the fortnight");
  assert.ok(html.includes("Later"), "no way forward through the horizon");
  assert.ok(html.includes("She is booked solid"), "no state for a horizon with nothing free");
});
