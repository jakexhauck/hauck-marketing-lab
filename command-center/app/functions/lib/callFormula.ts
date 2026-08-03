// The arithmetic a sales call does out loud.
//
// "You're at 12 installs, you want 30, your ticket is $9,500, so that's another
// $171,000 a month." Jake was doing that in his head while someone talked at
// him. This works it out instead, from answers typed earlier in the same call.
//
// Deliberately tiny. Four operators, brackets, unary minus, and names that
// stand for answers. No functions, no variables of its own, no strings, no
// comparisons, and above all no eval: a formula is typed on a management page
// and evaluated in a browser, so anything that could reach the host through it
// would be a hole with a text box in front of it. What is here cannot express
// anything except a number.
//
// Compiled once (on the Playbook page, and again on the server before it is
// stored) and evaluated many times (on every keystroke of a live call), which
// is why the two halves are separate functions.
//
// Pure: no React, no Supabase, no Date. Shared by the endpoint that stores a
// formula and the page that reads it, so a formula can never be accepted one
// way and refused the other.

// A name inside a formula, and a {token} inside a prompt, are the same thing:
// the key an answer was saved under. Lowercase, starts with a letter, no
// leading digits, capped short because it is read at a glance mid-call.
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,23}$/;

export function isAnswerKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

// How a computed number is drawn. Money for revenue, number for counts and for
// a margin like 0.35.
export type ValueFormat = "money" | "number";

export function isValueFormat(value: unknown): value is ValueFormat {
  return value === "money" || value === "number";
}

// ===== Reading a number out of what was typed =====

// What Jake types is prose, not a number: "$9,500", "9500", "about 12", "30/mo".
// A formula needs a number out of it, and refusing anything that is not already
// clean would mean the calc silently died because someone typed a dollar sign.
//
// So: strip the money furniture, then take the FIRST number in the string.
// "12-15" reads as 12, which is a choice rather than an accident. The
// alternative is a dash where a number should be, and mid-call a
// slightly-conservative number beats no number.
//
// Returns null when there is no number in there at all, which is how "" and
// "they wouldn't say" end up as a dash rather than as zero. Zero is a real
// answer and must never be what "no answer" looks like.
export function parseAnswerNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/[$,\s]/g, "");
  const match = /-?\d+(?:\.\d+)?/.exec(stripped);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function formatValue(n: number, format: ValueFormat): string {
  if (!Number.isFinite(n)) return "";

  // Rounded to the penny BEFORE deciding whether it is a whole number.
  // 171000 * 0.35 is 59849.99999999999 in binary floating point, and without
  // this it would be drawn as $59,850.00: two decimal places that exist only
  // to hide an error in the fifteenth. Round first and it is $59,850, which is
  // what it is and what Jake says out loud.
  //
  // Only the DISPLAY rounds. The value itself stays exact, so a calc built on
  // another calc does not compound a rounding twice.
  const rounded = Math.round(n * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  const body = rounded.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (format !== "money") return body;
  // The minus goes outside the sign, so a negative gap reads -$4,000 rather
  // than $-4,000.
  return rounded < 0 ? `-$${body.slice(1)}` : `$${body}`;
}

// ===== Compiling =====

type Node =
  | { t: "num"; value: number }
  | { t: "key"; key: string }
  | { t: "neg"; on: Node }
  | { t: "op"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

export interface CompiledFormula {
  node: Node;
  // Every key the formula reads, in the order met, deduped. The Playbook page
  // uses it to say which answers a calc is waiting on, and the resolver uses it
  // to find a calc that references itself.
  keys: string[];
}

export type CompileResult =
  | { ok: true; formula: CompiledFormula }
  | { ok: false; error: string };

type Token =
  | { t: "num"; value: number }
  | { t: "key"; key: string }
  | { t: "punct"; value: "+" | "-" | "*" | "/" | "(" | ")" };

// Whitespace between tokens is free, and anything that is not a number, a key,
// an operator or a bracket stops the whole thing. There is no error recovery on
// purpose: half a formula is not worth guessing at.
function tokenize(src: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" || ch === ")") {
      tokens.push({ t: "punct", value: ch });
      i += 1;
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      const match = /^\d+(?:\.\d+)?/.exec(src.slice(i))!;
      tokens.push({ t: "num", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    if (ch >= "a" && ch <= "z") {
      const match = /^[a-z][a-z0-9_]*/.exec(src.slice(i))!;
      const key = match[0];
      if (!KEY_PATTERN.test(key)) {
        return { ok: false, error: `"${key}" is too long to be an answer name.` };
      }
      tokens.push({ t: "key", key });
      i += key.length;
      continue;
    }

    // Named so the message can say what was actually typed. An uppercase name
    // lands here, which is the common mistake and worth its own sentence.
    if (ch >= "A" && ch <= "Z") {
      return { ok: false, error: "Answer names are lowercase, so goal rather than Goal." };
    }
    return { ok: false, error: `Cannot use "${ch}" in a formula.` };
  }

  return { ok: true, tokens };
}

// Recursive descent, two levels of precedence and brackets. Small enough to
// read in one sitting, which is the point: nobody should have to trust this.
export function compileFormula(src: unknown): CompileResult {
  if (typeof src !== "string" || src.trim() === "") {
    return { ok: false, error: "Write the sum itself, for example (goal - installs) * avg_ticket" };
  }

  const lexed = tokenize(src);
  if (!lexed.ok) return { ok: false, error: lexed.error };
  const tokens = lexed.tokens;
  if (tokens.length === 0) {
    return { ok: false, error: "Write the sum itself, for example (goal - installs) * avg_ticket" };
  }

  const keys: string[] = [];
  let pos = 0;
  let failure: string | null = null;

  const peek = (): Token | null => tokens[pos] ?? null;

  const fail = (message: string): Node => {
    // First failure wins. Later ones are noise from a parser walking through
    // wreckage it should not have been in.
    if (failure === null) failure = message;
    return { t: "num", value: 0 };
  };

  // atom := number | key | "(" expression ")" | "-" atom
  const atom = (): Node => {
    const token = peek();
    if (!token) return fail("The sum stops early. Something is missing off the end.");

    if (token.t === "num") {
      pos += 1;
      return { t: "num", value: token.value };
    }
    if (token.t === "key") {
      pos += 1;
      if (!keys.includes(token.key)) keys.push(token.key);
      return { t: "key", key: token.key };
    }
    if (token.value === "-") {
      pos += 1;
      return { t: "neg", on: atom() };
    }
    if (token.value === "(") {
      pos += 1;
      const inner = expression();
      const close = peek();
      if (!close || close.t !== "punct" || close.value !== ")") {
        return fail("A bracket was opened and never closed.");
      }
      pos += 1;
      return inner;
    }
    return fail(`"${token.value}" cannot start that part of the sum.`);
  };

  // term := atom (("*" | "/") atom)*
  const term = (): Node => {
    let left = atom();
    for (;;) {
      const token = peek();
      if (!token || token.t !== "punct" || (token.value !== "*" && token.value !== "/")) break;
      pos += 1;
      left = { t: "op", op: token.value, left, right: atom() };
    }
    return left;
  };

  // expression := term (("+" | "-") term)*
  const expression = (): Node => {
    let left = term();
    for (;;) {
      const token = peek();
      if (!token || token.t !== "punct" || (token.value !== "+" && token.value !== "-")) break;
      pos += 1;
      left = { t: "op", op: token.value, left, right: term() };
    }
    return left;
  };

  const node = expression();

  if (failure !== null) return { ok: false, error: failure };
  if (pos < tokens.length) {
    // Everything parsed but there is more left over: "goal installs" or a
    // stray closing bracket.
    return { ok: false, error: "There is something extra on the end of the sum." };
  }

  return { ok: true, formula: { node, keys } };
}

// ===== Evaluating =====

// Every input is optional, because mid-call most of them are. A missing input,
// a divide by zero, or anything that overflows all give null, and null spreads:
// a sum with one unanswered question in it is not a number yet, and showing one
// anyway would be the single worst thing this file could do.
export function evaluateFormula(
  formula: CompiledFormula,
  values: Readonly<Record<string, number | null>>,
): number | null {
  const walk = (node: Node): number | null => {
    switch (node.t) {
      case "num":
        return node.value;
      case "key": {
        const value = values[node.key];
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }
      case "neg": {
        const on = walk(node.on);
        return on === null ? null : -on;
      }
      case "op": {
        const left = walk(node.left);
        if (left === null) return null;
        const right = walk(node.right);
        if (right === null) return null;
        if (node.op === "+") return finite(left + right);
        if (node.op === "-") return finite(left - right);
        if (node.op === "*") return finite(left * right);
        // Dividing by zero is not an error to report, it is an answer that does
        // not exist yet: margin is 0 because nobody has typed it.
        return right === 0 ? null : finite(left / right);
      }
    }
  };
  return walk(formula.node);
}

function finite(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}
