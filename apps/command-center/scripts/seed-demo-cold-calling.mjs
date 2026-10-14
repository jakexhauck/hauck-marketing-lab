// Fill the cold-calling surfaces with obviously-fake data so the whole flow can
// be seen working, then take it all back out again.
//
//   node scripts/seed-demo-cold-calling.mjs          # seed
//   node scripts/seed-demo-cold-calling.mjs --clean  # remove every seeded row
//
// This writes to the REAL database (there is only one). Everything it creates is
// therefore branded so the cleanup can be exact:
//
//   - leads.source starts with "DEMO" and notes end with the marker below
//   - the demo caller's admin account is named "Demo Caller (delete me)"
//   - tracker rows are written ONLY for that demo caller, never for a real
//     account, so cleaning up can never delete a number you actually typed
//
// Nothing here touches an existing row.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "[demo-seed]";
const DEMO_EMAIL = "demo.caller@hauckmarketing.invalid";
const DEMO_NAME = "Demo Caller (delete me)";

function loadEnv() {
  const out = {};
  for (const file of [".dev.vars", ".env.local"]) {
    let text = "";
    try {
      text = readFileSync(join(APP_DIR, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (!(key in out)) out[key] = value;
    }
  }
  return out;
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .dev.vars");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const iso = (d) => d.toISOString().slice(0, 10);
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

// A deterministic shuffle-free spread, so re-running produces the same shape.
const FIRST = ["Marcus","Dana","Priya","Tom","Alicia","Ben","Sofia","Ray","Nina","Owen","Grace","Hector","Maya","Karl","Ivy","Dev","Rosa","Sam","Lena","Josh","Amara","Pete","Tessa","Nico","Bea","Frank","Zoe","Luis","Hana","Gus","Iris","Marco","Elena","Drew","Cleo","Rafa","Nadia","Kip","Vera","Sean"];
const LAST = ["Bell","Ortiz","Nair","Ridley","Vance","Cho","Marin","Boone","Petrov","Hale","Kim","Diaz","Osei","Brandt","Sun","Rao","Lima","Ford","Novak","Pratt","Okoye","Shaw","Quinn","Barone","Lund","Meyer","Tan","Cruz","Sato","Webb","Flynn","Rossi","Vega","Kane","Marsh","Silva","Amin","Doyle","Blum","Reid"];
const TZ = ["EST","CST","MST","PST"];
const SOURCES = ["DEMO Roofers list", "DEMO HVAC list", "DEMO Windows list", "DEMO Referral"];

function phone(i) {
  const n = 1000 + i * 7;
  return `(555) 0${String(10 + (i % 80)).padStart(2, "0")}-${String(n).slice(-4)}`;
}

async function findDemoCaller() {
  const { data } = await db
    .from("admin_accounts")
    .select("id, name")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();
  return data ?? null;
}

async function clean() {
  const caller = await findDemoCaller();

  const { data: removed, error: leadErr } = await db
    .from("leads")
    .delete()
    .like("source", "DEMO%")
    .select("id");
  if (leadErr) throw new Error(`leads: ${leadErr.message}`);
  console.log(`✓ removed ${removed?.length ?? 0} demo leads`);

  if (caller) {
    const { data: days } = await db
      .from("cold_calls")
      .delete()
      .eq("caller_id", caller.id)
      .select("id");
    console.log(`✓ removed ${days?.length ?? 0} demo tracker days`);
    await db.from("admin_accounts").delete().eq("id", caller.id);
    console.log(`✓ removed the ${DEMO_NAME} login`);
  } else {
    console.log("· no demo caller account to remove");
  }
  console.log("\nYour real leads, tracker rows and logins were not touched.");
}

async function seed() {
  // 1. The demo caller, so "each caller has their own page" has a second person
  // to be about. Its password is random and nobody is told it: this account
  // exists to be looked at, not signed into.
  let caller = await findDemoCaller();
  if (!caller) {
    const junk = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join("");
    const { data, error } = await db
      .from("admin_accounts")
      .insert({
        name: DEMO_NAME,
        email: DEMO_EMAIL,
        // Not a usable hash: no password can verify against it, by design.
        password_hash: `pbkdf2$100000$${junk.slice(0, 22)}$${junk}`,
        role: "cold_caller",
        status: "active",
      })
      .select("id, name")
      .single();
    if (error) throw new Error(`demo caller: ${error.message}`);
    caller = data;
    console.log(`✓ created ${DEMO_NAME}`);
  } else {
    console.log(`· ${DEMO_NAME} already exists`);
  }

  // 2. Leads, spread across every state the pages care about.
  const rows = [];
  for (let i = 0; i < 44; i++) {
    const source = SOURCES[i % SOURCES.length];
    const base = {
      first_name: FIRST[i % FIRST.length],
      last_name: LAST[(i * 3) % LAST.length],
      phone: phone(i),
      email: `${FIRST[i % FIRST.length].toLowerCase()}@example.com`,
      timezone: TZ[i % TZ.length],
      source,
      notes: i % 4 === 0 ? `Asked for a call after 4pm. ${MARKER}` : MARKER,
      no_answer: 0,
      status: "New",
      first_contact_date: null,
      last_contact: null,
      follow_up_date: null,
      appointment_date: null,
      // Two thirds go to the demo caller, the rest stay in the book so the
      // Unassigned filter and the hand-out flow both have something to show.
      assigned_to: i % 3 === 2 ? null : caller.id,
    };

    if (i < 18) {
      // Fresh queue: never called.
    } else if (i < 26) {
      base.status = "No Answer";
      base.no_answer = 1 + (i % 3);
      base.first_contact_date = dayOffset(-(3 + (i % 5)));
      base.last_contact = dayOffset(-(1 + (i % 3)));
    } else if (i < 33) {
      // Callbacks: some overdue, one today, the rest ahead.
      base.status = "Contacted";
      base.first_contact_date = dayOffset(-(2 + (i % 4)));
      base.last_contact = dayOffset(-(1 + (i % 2)));
      base.follow_up_date = dayOffset(i === 26 ? -3 : i === 27 ? -1 : i === 28 ? 0 : i - 27);
    } else if (i < 40) {
      // Booked: past and upcoming meetings.
      base.status = "Booked";
      base.first_contact_date = dayOffset(-(5 + (i % 6)));
      base.last_contact = dayOffset(-(2 + (i % 4)));
      base.appointment_date = dayOffset(i < 36 ? i - 37 : i - 32);
    } else {
      base.status = "Dead";
      base.first_contact_date = dayOffset(-(6 + (i % 5)));
      base.last_contact = dayOffset(-(4 + (i % 3)));
    }
    rows.push(base);
  }

  const { data: inserted, error } = await db.from("leads").insert(rows).select("id");
  if (error) throw new Error(`leads: ${error.message}`);
  console.log(`✓ inserted ${inserted.length} demo leads`);

  // 3. A month of dialing for the demo caller ONLY. Real accounts are never
  // written to, so the cleanup can never take out a number you typed yourself.
  const now = new Date();
  const days = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue; // nobody dials the weekend
    const calls = 70 + ((d * 13) % 55);
    const pickups = Math.round(calls * (0.14 + ((d % 7) * 0.012)));
    const passThrough = Math.round(pickups * (0.35 + ((d % 5) * 0.03)));
    days.push({
      day: iso(date),
      caller_id: caller.id,
      calls_made: calls,
      pickups,
      pass_through: passThrough,
      meetings_booked: d % 4 === 0 ? 2 : d % 3 === 0 ? 1 : 0,
      objections: d % 5 === 0 ? "Happy with current provider" : null,
      notes: null,
    });
  }
  if (days.length) {
    const { error: dayErr } = await db
      .from("cold_calls")
      .upsert(days, { onConflict: "day,caller_id" });
    if (dayErr) throw new Error(`cold_calls: ${dayErr.message}`);
    console.log(`✓ wrote ${days.length} dialing days for ${DEMO_NAME}`);
  }

  console.log(`
Done. In Acquisition > Cold Call:
  · pick "${DEMO_NAME}" in the person selector to see one caller's whole page
  · Leads has a queue to work and a book to hand out (some rows are unassigned)
  · Callbacks has overdue, today and upcoming
  · Booked has past and upcoming meetings
  · Tracker and Scoreboard have a month of dialing

Remove all of it with:  node scripts/seed-demo-cold-calling.mjs --clean`);
}

const wantsClean = process.argv.includes("--clean");
try {
  await (wantsClean ? clean() : seed());
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
