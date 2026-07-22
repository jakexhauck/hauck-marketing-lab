// Google Docs' text/html export into something we can render inside the admin.
//
// The export is a full document whose every visual property lives in a <style>
// block of generated class names (.c3 { font-weight:700 }) applied to a soup of
// <span>s. Stripping classes naively would therefore throw away all bold and
// italic, so we read the style block first, work out which classes mean bold or
// italic, and promote those spans to <strong>/<em> before the classes go.
//
// Pure and dependency-free on purpose: it runs in a Worker (no DOM) and is the
// piece most likely to meet a Doc we have not seen, so it must be unit testable.

const ALLOWED = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "ul", "ol", "li",
  "strong", "em", "u", "sup", "sub",
  "a", "img", "br", "hr",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "blockquote", "code", "pre",
]);

// Rendered as their children: they carry styling we have already harvested.
const UNWRAP = new Set(["span", "font", "div", "html", "body", "section", "article"]);

// Dropped outright, contents and all.
const DROP = new Set(["script", "style", "head", "meta", "link", "title", "noscript", "iframe", "object", "embed"]);

const VOID = new Set(["img", "br", "hr", "meta", "link", "input"]);

const RENAME: Record<string, string> = { b: "strong", i: "em", strike: "s", h5: "h4", h6: "h4" };

// Containers worth deleting when they end up with nothing visible inside.
const PRUNE_IF_EMPTY = new Set(["p", "li", "h1", "h2", "h3", "h4", "blockquote", "td", "th", "strong", "em", "u"]);

interface TextNode { type: "text"; value: string }
interface ElNode { type: "el"; tag: string; attrs: Record<string, string>; children: Node[] }
type Node = TextNode | ElNode;

export function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || "");
  const t = m?.[1]?.trim();
  return t ? t : null;
}

/** Google Doc export HTML reduced to a clean, safe subset. */
export function cleanDocHtml(html: string): string {
  if (!html) return "";
  const emphasis = readEmphasisClasses(html);
  const body = takeBody(html);
  const nodes = parse(body);
  const cleaned = transform(nodes, emphasis);
  return serialize(cleaned);
}

// --- style block -----------------------------------------------------------

interface EmphasisClasses { bold: Set<string>; italic: Set<string> }

// Map generated class names to the emphasis they encode, so `.c3{font-weight:700}`
// survives as <strong> rather than vanishing with the rest of the CSS.
function readEmphasisClasses(html: string): EmphasisClasses {
  const bold = new Set<string>();
  const italic = new Set<string>();
  for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of (block[1] || "").matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g)) {
      const name = rule[1];
      const decls = rule[2];
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(decls)) bold.add(name);
      if (/font-style\s*:\s*italic/i.test(decls)) italic.add(name);
    }
  }
  return { bold, italic };
}

function takeBody(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return m ? m[1] : html;
}

// --- parse -----------------------------------------------------------------

const TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/)?>/g;

function parse(input: string): Node[] {
  const src = input.replace(/<!--[\s\S]*?-->/g, "");
  const root: ElNode = { type: "el", tag: "#root", attrs: {}, children: [] };
  const stack: ElNode[] = [root];
  let last = 0;

  const pushText = (raw: string) => {
    if (!raw) return;
    // Raw angle brackets that were not part of a tag are noise; entities such as
    // &lt; are left untouched so escaped text survives verbatim.
    const value = raw.replace(/[<>]/g, "");
    if (value) stack[stack.length - 1].children.push({ type: "text", value });
  };

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src))) {
    pushText(src.slice(last, m.index));
    last = TAG_RE.lastIndex;

    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    const selfClosed = !!m[4] || VOID.has(tag);

    if (closing) {
      // Close the nearest matching open element, ignoring strays.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }

    const node: ElNode = { type: "el", tag, attrs: parseAttrs(m[3] || ""), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosed) stack.push(node);
  }
  pushText(src.slice(last));
  return root.children;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
  }
  return out;
}

// --- transform -------------------------------------------------------------

function transform(nodes: Node[], emphasis: EmphasisClasses): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.type === "text") { out.push(node); continue; }
    if (DROP.has(node.tag)) continue;

    const children = transform(node.children, emphasis);
    const tag = RENAME[node.tag] ?? node.tag;

    if (UNWRAP.has(tag) || !ALLOWED.has(tag)) {
      // A span carrying a bold/italic class becomes real emphasis; otherwise it
      // dissolves into its children.
      const wrapped = applyEmphasis(children, node.attrs["class"], emphasis);
      out.push(...wrapped);
      continue;
    }

    if (tag === "a") {
      const href = safeHref(node.attrs["href"]);
      if (!href) { out.push(...children); continue; }
      out.push({ type: "el", tag: "a", attrs: { href, target: "_blank", rel: "noopener noreferrer" }, children });
      continue;
    }

    if (tag === "img") {
      const src = safeHref(node.attrs["src"]);
      if (!src) continue;
      out.push({ type: "el", tag: "img", attrs: { src }, children: [] });
      continue;
    }

    const el: ElNode = { type: "el", tag, attrs: {}, children };
    if (PRUNE_IF_EMPTY.has(tag) && !hasVisibleContent(el)) continue;
    out.push(el);
  }
  return out;
}

function applyEmphasis(children: Node[], className: string | undefined, emphasis: EmphasisClasses): Node[] {
  if (!className || children.length === 0) return children;
  const names = className.split(/\s+/).filter(Boolean);
  let wrapped = children;
  if (names.some((n) => emphasis.italic.has(n))) {
    wrapped = [{ type: "el", tag: "em", attrs: {}, children: wrapped }];
  }
  if (names.some((n) => emphasis.bold.has(n))) {
    wrapped = [{ type: "el", tag: "strong", attrs: {}, children: wrapped }];
  }
  return wrapped;
}

// Only absolute web links and mail links survive; javascript: and data: do not.
function safeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  let href = decodeEntities(raw).trim();

  // Google wraps every external link as /url?q=<target>&sa=D&source=editors
  if (/^https?:\/\/(www\.)?google\.com\/url\?/i.test(href)) {
    const q = /[?&]q=([^&]*)/.exec(href)?.[1];
    if (q) {
      try { href = decodeURIComponent(q); } catch { href = q; }
    }
  }
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return null;
  return escapeAttr(href);
}

function hasVisibleContent(node: Node): boolean {
  if (node.type === "text") return node.value.replace(/&nbsp;|&#160;|\s/g, "") !== "";
  if (node.tag === "img" || node.tag === "br" || node.tag === "hr") return true;
  return node.children.some(hasVisibleContent);
}

// --- serialize -------------------------------------------------------------

function serialize(nodes: Node[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") { out += node.value; continue; }
    const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
    if (VOID.has(node.tag)) { out += `<${node.tag}${attrs}>`; continue; }
    out += `<${node.tag}${attrs}>${serialize(node.children)}</${node.tag}>`;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
