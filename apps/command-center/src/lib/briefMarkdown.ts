// The Client Brief is stored as markdown (the runner and the agents work in it,
// and the Drive Doc is written from it) but edited in a Google Docs style
// editor (Tiptap). This is the bridge both ways, limited to what the toolbar
// can make plus what agents usually write:
//
//   blocks   paragraphs, # ## ### headings, - bullets and 1. numbered lists
//            (nested by indent), a single newline inside a paragraph is a
//            line break
//   inline   __bold__ (also **bold**), *italic* (also _italic_ at a word
//            edge), <u>underline</u>, `code`, [text](https://...) links
//
// Bold is written as __x__ and italic as *x* so the two never run into each
// other (***x*** has no single reading). Characters that would read as
// formatting are escaped with a backslash. Anything else (quotes, tables) is
// kept as the characters written. Pure: no DOM, no editor, so it is tested
// on its own; the round trip tests are the contract.

export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: Mark[];
}

// ---------------------------------------------------------------- inline

const SAFE_HREF = /^(https?:\/\/|mailto:)\S+$/i;
const ESCAPABLE = new Set(["\\", "*", "_", "`", "[", "]", "<", "#", "-", "+", ".", ")"]);
const isWord = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

function sameMarks(a: Mark[] = [], b: Mark[] = []): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushText(out: DocNode[], text: string, marks: Mark[]) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === "text" && sameMarks(last.marks, marks)) {
    last.text += text;
    return;
  }
  const node: DocNode = { type: "text", text };
  if (marks.length) node.marks = marks;
  out.push(node);
}

// Find a closing delimiter at or after `from`, skipping escaped characters.
function findClose(s: string, delim: string, from: number, check?: (i: number) => boolean): number {
  for (let i = from; i <= s.length - delim.length; i += 1) {
    if (s[i] === "\\") {
      i += 1;
      continue;
    }
    if (s.startsWith(delim, i) && (!check || check(i))) return i;
  }
  return -1;
}

// Marks are kept in one order (link, bold, italic, underline, code) so the
// same formatting always reads back as the same node.
const ORDER = ["link", "bold", "italic", "underline", "code"];
const withMark = (marks: Mark[], m: Mark) =>
  [...marks.filter((x) => x.type !== m.type), m].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

function parseInline(s: string, marks: Mark[], out: DocNode[]): DocNode[] {
  let text = "";
  const flush = () => {
    pushText(out, text, marks);
    text = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && ESCAPABLE.has(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "\n") {
      flush();
      out.push({ type: "hardBreak" });
      i += 1;
      continue;
    }
    if (c === "`") {
      const end = findClose(s, "`", i + 1);
      if (end > i + 1) {
        flush();
        pushText(out, s.slice(i + 1, end), withMark(marks, { type: "code" }));
        i = end + 1;
        continue;
      }
    }
    if (s.startsWith("<u>", i)) {
      const end = findClose(s, "</u>", i + 3);
      if (end > i + 3) {
        flush();
        parseInline(s.slice(i + 3, end), withMark(marks, { type: "underline" }), out);
        i = end + 4;
        continue;
      }
    }
    if (s.startsWith("__", i) || s.startsWith("**", i)) {
      const d = s.slice(i, i + 2);
      const end = findClose(s, d, i + 2);
      if (end > i + 2) {
        flush();
        parseInline(s.slice(i + 2, end), withMark(marks, { type: "bold" }), out);
        i = end + 2;
        continue;
      }
    }
    if (c === "*" || (c === "_" && !isWord(s[i - 1]))) {
      const end = findClose(s, c, i + 1, (j) => s[j + 1] !== c && (c === "*" || !isWord(s[j + 1])));
      if (end > i + 1) {
        flush();
        parseInline(s.slice(i + 1, end), withMark(marks, { type: "italic" }), out);
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const close = findClose(s, "](", i + 1);
      const end = close > i ? s.indexOf(")", close + 2) : -1;
      const href = end > 0 ? s.slice(close + 2, end) : "";
      if (close > i + 1 && end > 0 && SAFE_HREF.test(href)) {
        flush();
        parseInline(s.slice(i + 1, close), withMark(marks, { type: "link", attrs: { href } }), out);
        i = end + 1;
        continue;
      }
    }
    text += c;
    i += 1;
  }
  flush();
  return out;
}

function escapeText(t: string): string {
  return t.replace(/[\\*_`[\]<]/g, (m) => `\\${m}`);
}

function wrap(t: string, marks: Mark[]): string {
  const has = (type: string) => marks.some((m) => m.type === type);
  let s = has("code") ? `\`${t}\`` : escapeText(t);
  if (has("underline")) s = `<u>${s}</u>`;
  if (has("italic")) s = `*${s}*`;
  if (has("bold")) s = `__${s}__`;
  return s;
}

const hrefOf = (n: DocNode) => {
  const l = (n.marks ?? []).find((m) => m.type === "link");
  return l ? String(l.attrs?.href ?? "") : null;
};

function inlineToMarkdown(nodes: DocNode[] = []): string {
  let out = "";
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    const href = n.type === "text" ? hrefOf(n) : null;
    if (href) {
      // Neighbours on the same link become one link.
      let inner = "";
      while (i < nodes.length && nodes[i].type === "text" && hrefOf(nodes[i]) === href) {
        const m = nodes[i];
        inner += wrap(
          m.text ?? "",
          (m.marks ?? []).filter((x) => x.type !== "link"),
        );
        i += 1;
      }
      out += `[${inner}](${href})`;
      continue;
    }
    if (n.type === "hardBreak") out += "\n";
    else if (n.type === "text") out += wrap(n.text ?? "", n.marks ?? []);
    i += 1;
  }
  // A line that starts like a heading or a list item would read back as one.
  return out
    .split("\n")
    .map((line) =>
      line
        .replace(/^#/, "\\#")
        .replace(/^([-+])(?= )/, "\\$1")
        .replace(/^(\d+)([.)])(?= )/, "$1\\$2"),
    )
    .join("\n");
}

// ---------------------------------------------------------------- blocks

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

const paragraph = (s: string): DocNode => {
  const content = parseInline(s, [], []);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

interface ListLine {
  indent: number;
  ordered: boolean;
  start: number;
  text: string;
}

function buildList(lines: ListLine[], from: number): { node: DocNode; next: number } {
  const first = lines[from];
  const items: DocNode[] = [];
  let i = from;
  while (i < lines.length && lines[i].indent === first.indent && lines[i].ordered === first.ordered) {
    const item: DocNode = { type: "listItem", content: [paragraph(lines[i].text)] };
    i += 1;
    if (i < lines.length && lines[i].indent > first.indent) {
      const sub = buildList(lines, i);
      item.content!.push(sub.node);
      i = sub.next;
      // Deeper lines that did not fit the sub-list's own level join it too.
      while (i < lines.length && lines[i].indent > first.indent) {
        const more = buildList(lines, i);
        item.content!.push(more.node);
        i = more.next;
      }
    }
    items.push(item);
  }
  const node: DocNode = first.ordered
    ? { type: "orderedList", attrs: { start: first.start }, content: items }
    : { type: "bulletList", content: items };
  return { node, next: i };
}

export function markdownToDoc(md: string): DocNode {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const content: DocNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const inner = parseInline(h[2], [], []);
      const node: DocNode = { type: "heading", attrs: { level: Math.min(h[1].length, 3) } };
      if (inner.length) node.content = inner;
      content.push(node);
      i += 1;
      continue;
    }
    if (LIST.test(line)) {
      const items: ListLine[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = LIST.exec(lines[i]);
        if (m) {
          const ordered = /\d/.test(m[2]);
          items.push({ indent: m[1].length, ordered, start: ordered ? parseInt(m[2], 10) : 1, text: m[3] });
        } else if (items.length) {
          // A continuation line belongs to the item above, as a line break.
          items[items.length - 1].text += `\n${lines[i].trim()}`;
        }
        i += 1;
      }
      let j = 0;
      while (j < items.length) {
        const built = buildList(items, j);
        content.push(built.node);
        j = built.next;
      }
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !LIST.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    content.push(paragraph(para.join("\n")));
  }
  return { type: "doc", content };
}

function listToMarkdown(list: DocNode, indent: string): string[] {
  const ordered = list.type === "orderedList";
  let n = ordered ? Number(list.attrs?.start ?? 1) || 1 : 0;
  const out: string[] = [];
  for (const item of list.content ?? []) {
    const marker = ordered ? `${n}. ` : "- ";
    n += 1;
    const pad = indent + " ".repeat(marker.length);
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        out.push(...listToMarkdown(child, pad));
        continue;
      }
      const text = inlineToMarkdown(child.content).split("\n").join(`\n${pad}`);
      out.push(first ? `${indent}${marker}${text}` : `${pad}${text}`);
      first = false;
    }
    if (first) out.push(`${indent}${marker}`.trimEnd());
  }
  return out;
}

export function docToMarkdown(doc: DocNode): string {
  const blocks: string[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const text = inlineToMarkdown(node.content);
      if (text.trim()) blocks.push(`${"#".repeat(Number(node.attrs?.level ?? 1))} ${text}`);
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      blocks.push(listToMarkdown(node, "").join("\n"));
    } else {
      const text = inlineToMarkdown(node.content);
      if (text.trim()) blocks.push(text);
    }
  }
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------- plain

export interface PlainLine {
  text: string;
  // 0 for body text, else the heading level inside the section.
  heading: number;
}

function plainInline(nodes: DocNode[] = []): string {
  let out = "";
  let i = 0;
  while (i < nodes.length) {
    const href = nodes[i].type === "text" ? hrefOf(nodes[i]) : null;
    if (href) {
      let t = "";
      while (i < nodes.length && hrefOf(nodes[i]) === href) t += nodes[i++].text ?? "";
      out += t === href ? t : `${t} (${href})`;
      continue;
    }
    out += nodes[i].type === "hardBreak" ? "\n" : (nodes[i].text ?? "");
    i += 1;
  }
  return out;
}

function plainList(list: DocNode, depth: number, out: PlainLine[]) {
  let n = Number(list.attrs?.start ?? 1) || 1;
  for (const item of list.content ?? []) {
    const marker = list.type === "orderedList" ? `${n++}. ` : "\u2022 ";
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") plainList(child, depth + 1, out);
      else {
        out.push({ text: `${"  ".repeat(depth)}${first ? marker : ""}${plainInline(child.content)}`, heading: 0 });
        first = false;
      }
    }
  }
}

/** The brief as Doc lines: marks taken out, bullets as bullet characters. */
export function markdownToLines(md: string): PlainLine[] {
  const out: PlainLine[] = [];
  for (const node of markdownToDoc(md).content ?? []) {
    if (node.type === "heading") out.push({ text: plainInline(node.content), heading: Number(node.attrs?.level ?? 1) });
    else if (node.type === "bulletList" || node.type === "orderedList") plainList(node, 0, out);
    else out.push({ text: plainInline(node.content), heading: 0 });
  }
  return out;
}

export function markdownToPlain(md: string): string {
  return markdownToLines(md)
    .map((l) => l.text)
    .join("\n");
}
