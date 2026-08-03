// What the call knows so far.
//
// Jake types "12" against "how many jobs last month", and forty minutes later
// the timeline line reads "hitting 30 installs/month and adding $59,850/month
// in profit" with both numbers already in it. This is the bit in the middle:
// it takes the answers typed against keyed questions, works out the calcs built
// on them, and hands back one map that both the facts strip and every {token}
// in every prompt read from.
//
// Pure: no React, no storage, no Date. The page owns reading and writing; this
// only ever turns what was typed into what is known.

import {
  compileFormula,
  evaluateFormula,
  formatValue,
  parseAnswerNumber,
  type CompiledFormula,
} from "../../functions/lib/callFormula";
import {
  RESERVED_KEYS,
  splitTokens,
  type PlaybookItem,
  type TextPart,
} from "../../functions/lib/salesPlaybook";

export type FactSource = "meeting" | "typed" | "calc";

export interface Fact {
  key: string;
  // What to call it in the strip. The question it came from, shortened, or the
  // calc's own label.
  label: string;
  source: FactSource;
  // What to draw. Empty string when nothing is known yet, which is the only
  // thing the page has to test.
  display: string;
  // The same thing as a number where there is one, for the calcs built on it.
  // Null covers both "not answered" and "answered with words".
  number: number | null;
}

export type Facts = Map<string, Fact>;

// A fact that exists but has nothing in it yet. Kept in the map rather than
// left out, because the strip has to show the blanks: seeing that avg_ticket is
// still empty is how Jake knows the gap is about to be a dash.
function blank(key: string, label: string, source: FactSource): Fact {
  return { key, label, source, display: "", number: null };
}

// A question's own words are the label, cut at the first sentence-ish break so
// the strip stays a strip. "How many jobs did you run last month?" becomes
// "How many jobs did you run last month".
function labelFor(item: PlaybookItem): string {
  const text = item.prompt.replace(/\s+/g, " ").trim();
  const cut = text.split(/[?.:]/)[0].trim();
  const short = cut || text;
  return short.length > 42 ? `${short.slice(0, 41)}...` : short;
}

export interface BuildFactsInput {
  // Every live playbook row, all three sections. Keyed ones contribute.
  items: readonly PlaybookItem[];
  // Item id -> what was typed under it, straight from the call state.
  notes: Readonly<Record<string, string>>;
  // The keys that come from the booking rather than from a question.
  seed: Readonly<Record<string, string>>;
}

export function buildFacts({ items, notes, seed }: BuildFactsInput): Facts {
  const facts: Facts = new Map();

  // 1. The booking. First, so a playbook key can be checked against them and
  //    refused rather than quietly winning.
  for (const { key, label } of RESERVED_KEYS) {
    const raw = (seed[key] ?? "").trim();
    facts.set(key, {
      key,
      label,
      source: "meeting",
      display: raw,
      number: null,
    });
  }

  const live = items.filter((i) => !i.archivedAt && i.answerKey);

  // 2. What was typed. A duplicate key is skipped rather than overwriting:
  //    first in playbook order wins, and the Playbook page refuses to store
  //    the duplicate in the first place.
  for (const item of live) {
    const key = item.answerKey!;
    if (item.kind === "calc" || facts.has(key)) continue;
    const raw = (notes[item.id] ?? "").trim();
    facts.set(key, {
      key,
      label: labelFor(item),
      source: "typed",
      display: raw,
      number: parseTyped(raw),
    });
  }

  // 3. The sums. Compiled here and thrown away: a live call re-runs this on
  //    every keystroke, and compiling eight short formulas is nothing next to
  //    the render that follows it.
  const calcs = new Map<string, { item: PlaybookItem; compiled: CompiledFormula | null }>();
  for (const item of live) {
    const key = item.answerKey!;
    if (item.kind !== "calc" || facts.has(key) || calcs.has(key)) continue;
    const result = compileFormula(item.formula);
    calcs.set(key, { item, compiled: result.ok ? result.formula : null });
  }

  // Depth first, because one calc is allowed to be built on another
  // (gap_profit reads gap_revenue). `visiting` is what stops a formula that
  // reaches itself from doing so forever: a cycle resolves to null, which draws
  // as a dash, which is the honest answer to "what is x when x is defined as
  // x". `done` keeps the walk linear rather than re-deriving shared inputs.
  const done = new Set<string>();
  const visiting = new Set<string>();

  const resolve = (key: string): number | null => {
    const known = facts.get(key);
    if (known && (known.source !== "calc" || done.has(key))) return known.number;

    const calc = calcs.get(key);
    if (!calc) return null;
    if (visiting.has(key)) return null;

    if (!calc.compiled) {
      facts.set(key, blank(key, labelFor(calc.item), "calc"));
      done.add(key);
      return null;
    }

    visiting.add(key);
    const values: Record<string, number | null> = {};
    for (const needed of calc.compiled.keys) values[needed] = resolve(needed);
    visiting.delete(key);

    const value = evaluateFormula(calc.compiled, values);
    facts.set(key, {
      key,
      label: labelFor(calc.item),
      source: "calc",
      display: value === null ? "" : formatValue(value, calc.item.format),
      number: value,
    });
    done.add(key);
    return value;
  };

  for (const key of calcs.keys()) resolve(key);

  return facts;
}

// A booking value is text, and a typed answer is prose with a number somewhere
// in it. Only the second is worth reading a number out of: nobody multiplies by
// a phone number, which is why the reserved keys above are left at null.
function parseTyped(raw: string): number | null {
  return raw === "" ? null : parseAnswerNumber(raw);
}

// ===== Reading a prompt with its blanks filled =====

export interface RenderedPart {
  t: "text" | "token";
  value: string;
  // Token parts only: the key, and whether it actually has something in it.
  // The page draws a filled token as the answer and an empty one as the key
  // name in grey, so a blank coming up is visible before you read into it.
  key?: string;
  filled?: boolean;
}

export function renderText(text: string, facts: Facts): RenderedPart[] {
  return splitTokens(text).map((part: TextPart): RenderedPart => {
    if (part.t === "text") return { t: "text", value: part.value };
    const fact = facts.get(part.key);
    const filled = !!fact && fact.display !== "";
    return {
      t: "token",
      key: part.key,
      filled,
      value: filled ? fact!.display : part.key,
    };
  });
}

// ===== What survives the call =====

// The facts, as the block that goes into the outcome notes. Only what was
// actually answered: a summary listing eight dashes would bury the two things
// the call learned.
export function factsSummary(facts: Facts, order: readonly string[]): string {
  const lines: string[] = [];
  for (const key of order) {
    const fact = facts.get(key);
    // The booking's own fields are left out. They are already on the meeting,
    // and repeating the prospect's name back into their own notes is noise.
    if (!fact || fact.source === "meeting" || fact.display === "") continue;
    lines.push(`${fact.key}: ${fact.display}`);
  }
  return lines.join("\n");
}

// The order the strip and the summary read in: the booking first, then every
// keyed row in the order it appears on the call.
export function factOrder(items: readonly PlaybookItem[]): string[] {
  const order = RESERVED_KEYS.map((r) => r.key);
  for (const item of items) {
    if (item.archivedAt || !item.answerKey) continue;
    if (!order.includes(item.answerKey)) order.push(item.answerKey);
  }
  return order;
}
