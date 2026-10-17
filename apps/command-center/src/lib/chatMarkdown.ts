// The small slice of markdown an agent reply is drawn with: paragraphs,
// **bold**, `code`, numbered and bulleted lists, and https links.
//
// Pure, and the output is a tree of plain values, never HTML. ChatThread turns
// it into React elements, so model text only ever reaches the page as a text
// node: an <img onerror> in a reply shows as those characters. Links are https
// only, checked here and again nowhere else, so this is the one gate.
//
// Anything outside the slice (italics, tables, headings beyond a bold line) is
// left as the characters the model wrote. A stray asterisk is ugly; a parser
// that guesses wrong about one hides words.

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "ul"; items: Inline[][] };

/** The href when it is a plain https URL, else null. */
export function safeHref(s: string): string | null {
  if (!/^https:\/\/\S+$/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname ? s : null;
  } catch {
    return null;
  }
}

// One level of brackets inside the target, as in a Wikipedia URL.
const MD_LINK = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;
const BARE = /^https:\/\/[^\s<>()"'`\]]+/;
const TRAILING = /[.,;:!?]+$/;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const push = (node: Inline) => {
    if (text) out.push({ t: "text", v: text });
    text = "";
    out.push(node);
  };

  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        push({ t: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = s.indexOf("**", i + 2);
      if (end > i + 2 && s[i + 2] !== " " && s[end - 1] !== " ") {
        push({ t: "bold", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (s[i] === "[") {
      const m = rest.match(MD_LINK);
      if (m) {
        const href = safeHref(m[2]);
        const label = parseInline(m[1]);
        if (href) push({ t: "link", href, c: label });
        else for (const n of label) n.t === "text" ? (text += n.v) : push(n);
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith("https://") && (i === 0 || !/[A-Za-z0-9]/.test(s[i - 1]))) {
      const m = rest.match(BARE);
      const url = m ? m[0].replace(TRAILING, "") : "";
      const href = url ? safeHref(url) : null;
      if (href) {
        push({ t: "link", href, c: [{ t: "text", v: url }] });
        i += url.length;
        continue;
      }
    }
    text += s[i];
    i += 1;
  }
  if (text) out.push({ t: "text", v: text });
  return out;
}

const OL = /^\s*(\d{1,4})[.)]\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseChatMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  // Raw lines per block, parsed inline once the block is whole, so a list
  // item's continuation line joins its text before bold or links are read.
  type Open = { t: "p"; lines: string[] } | { t: "ol"; start: number; items: string[] } | { t: "ul"; items: string[] };
  const open: Open[] = [];
  let cur: Open | null = null;
  let blank = false;

  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      blank = true;
      continue;
    }
    const ol = raw.match(OL);
    const ul = ol ? null : raw.match(UL);
    if (ol || ul) {
      const kind = ol ? "ol" : "ul";
      const text = (ol ? ol[2] : ul![1]).trim();
      // A list carries on across a blank line: models space their items out.
      if (cur && cur.t === kind) cur.items.push(text);
      else {
        cur = kind === "ol" ? { t: "ol", start: Number(ol![1]), items: [text] } : { t: "ul", items: [text] };
        open.push(cur);
      }
    } else if (cur && cur.t !== "p" && !blank && /^\s+\S/.test(raw)) {
      cur.items[cur.items.length - 1] += ` ${raw.trim()}`;
    } else {
      const h = raw.match(HEADING);
      const line = h ? `**${h[1].trim()}**` : raw.trim();
      if (cur && cur.t === "p" && !blank && !h) cur.lines.push(line);
      else {
        cur = { t: "p", lines: [line] };
        open.push(cur);
        // A heading stands alone.
        if (h) cur = null;
      }
    }
    blank = false;
  }

  for (const b of open) {
    if (b.t === "p") blocks.push({ t: "p", lines: b.lines.map(parseInline) });
    else if (b.t === "ol") blocks.push({ t: "ol", start: b.start, items: b.items.map(parseInline) });
    else blocks.push({ t: "ul", items: b.items.map(parseInline) });
  }
  return blocks;
}
