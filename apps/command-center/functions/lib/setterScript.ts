// The trust boundary for the setter dialing script (migration 0044).
//
// The Settings tab's editor produces HTML (contenteditable), and the cockpit
// renders whatever this module let into the column. Sanitization therefore
// happens ON WRITE, with an allowlist, so the column can only ever hold
// markup that is safe to render verbatim:
//
//  - Only formatting tags survive (paragraphs, headings, lists, emphasis,
//    links). Anything else is unwrapped, keeping its text.
//  - script/style/iframe and friends are removed WITH their contents.
//  - Every attribute is dropped except an http(s) href on <a>, so on*
//    handlers, style, class and javascript:/data: URLs can never land.
//
// The tag/attribute decisions are pure and unit-tested; the walk itself uses
// the runtime's HTMLRewriter (available in wrangler dev and production;
// absent under vitest's node environment, which is why it is not in tests).

export const MAX_SCRIPT_HTML = 200_000;

// Formatting the editor's toolbar can produce, plus the tags browsers
// generate for the same intents (b/i, div for line breaks).
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
]);

// Removed WITH contents: unwrapping these would leak executable or invisible
// payload text into the script.
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript"]);

export function tagDecision(tagName: string): "keep" | "unwrap" | "drop" {
  const t = tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(t)) return "drop";
  return ALLOWED_TAGS.has(t) ? "keep" : "unwrap";
}

// The one attribute that survives: an http(s) href on a link.
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const proto = new URL(value.trim()).protocol;
    if (proto === "http:" || proto === "https:") return value.trim();
  } catch {
    /* relative or garbage: drop it */
  }
  return null;
}

export interface ScriptBody {
  tenantId?: string;
  html?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
}

export function validateScriptBody(body: ScriptBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  if (typeof body.html !== "string") {
    return { ok: false, code: "missing_html" };
  }
  if (body.html.length > MAX_SCRIPT_HTML) {
    return { ok: false, code: "too_long" };
  }
  return { ok: true };
}

// HTMLRewriter walk applying the decisions above. Streaming, so the size cap
// in validateScriptBody is what bounds the work.
export async function sanitizeScriptHtml(html: string): Promise<string> {
  const rewriter = new HTMLRewriter().on("*", {
    element(el) {
      const decision = tagDecision(el.tagName);
      if (decision === "drop") {
        el.remove();
        return;
      }
      if (decision === "unwrap") {
        el.removeAndKeepContent();
        return;
      }
      // Keep the tag, strip every attribute except a safe href on <a>.
      const keepHref = el.tagName.toLowerCase() === "a" ? safeHref(el.getAttribute("href")) : null;
      const names = [...el.attributes].map(([name]) => name);
      for (const name of names) el.removeAttribute(name);
      if (keepHref) {
        el.setAttribute("href", keepHref);
        // Scripts open mid-call; a link must never navigate the suite away.
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    },
  });
  return await rewriter.transform(new Response(html)).text();
}
