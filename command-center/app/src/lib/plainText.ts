// Turn CRM-authored HTML into readable plain text.
//
// Notes and messages that arrive from a form submission carry HTML, and the
// Setter Suite renders them as text, so the setter was reading tag soup:
//
//   <p style="padding-left: 0px!important;"><strong><em>First Name: </em></strong>Lisa<br></p>
//
// instead of "First Name: Lisa". Rendering the markup instead (innerHTML) is
// not the fix: this is third-party content on an internal admin screen, and it
// carries inline styles that would fight the cockpit's own layout. So it is
// flattened to text, keeping the line structure the tags implied.
//
// Input that is not HTML is returned as-is (minus surrounding whitespace), so a
// hand-typed note reading "price < 500" is never mangled.

// Blocks whose CONTENT is noise, removed outright rather than unwrapped.
const DROP_WITH_CONTENT = /<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi;

// Tags that end a visual line. Their closing form (and the self-closing <br>)
// becomes a newline so "First Name: Lisa" and "Phone: ..." do not run together.
const LINE_BREAKS = /<\s*br\s*\/?\s*>|<\s*\/\s*(p|div|li|tr|h[1-6]|blockquote|section|article)\s*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      // Codes outside the valid range would throw; leave those untouched
      // rather than lose the original characters.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

// Cheap test for "does this contain a real tag", so plain text passes straight
// through. Requires a letter or a slash after the "<", which "price < 500" and
// "a <3 b" do not have followed by a closing bracket.
const LOOKS_LIKE_HTML = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i;

export function toPlainText(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  if (!LOOKS_LIKE_HTML.test(raw)) return raw;

  const text = decodeEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(DROP_WITH_CONTENT, "")
      // A <br> sitting at the end of its block ("Lisa<br></p>") is one visual
      // break, not two. Dropped before LINE_BREAKS runs, or every field in a
      // form-submission note gains a blank line under it.
      .replace(/<\s*br\s*\/?\s*>(?=\s*<\s*\/)/gi, "")
      .replace(LINE_BREAKS, "\n")
      // Everything left is a tag that carries no line meaning (span, strong,
      // em, a, and the opening halves of the block tags above).
      .replace(/<[^>]*>/g, ""),
  );

  return text
    // House rule: no em dashes in anything the app renders. A numeric entity
    // (&#8212;) or a literal one in the source would otherwise reintroduce it
    // through the back door.
    .replace(/[–—]/g, "-")
    .split("\n")
    // Collapse the runs of whitespace the markup left behind, per line, so
    // indentation from the source HTML does not survive as leading spaces.
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    // A <p> wrapping a <div> produced two newlines for one visual break;
    // never show more than one blank line.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
