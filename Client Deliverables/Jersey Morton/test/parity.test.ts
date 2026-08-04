// index.html carries its own copy of the service list so the page can render
// before the worker answers. Duplication is deliberate; drift is not. If this
// fails, the page is quoting a price or a length the worker will not honour.
//
// Run: node --test "worker/test/parity.test.ts"
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

test("the booking page sends a Turnstile token and loads the widget", () => {
  assert.ok(html.includes("challenges.cloudflare.com/turnstile/v0/api.js"), "widget script missing");
  assert.ok(html.includes("turnstileToken: state.tsToken"), "token is not sent with the booking");
  assert.ok(html.includes('id="ts-box"'), "no container for the widget");
});
