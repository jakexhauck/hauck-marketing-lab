/* Render the SOP markdown in the Hauck Marketing house style.

   Metrics lifted from the Cold Caller Commission Structure doc's own HTML
   export, so these are its real numbers rather than an eyeball match:

     title        36pt bold
     section      18pt bold, 11.2pt padding above and below
     sub-section  14pt bold
     body         11pt
     index links  19pt, #1155cc, underlined, 12pt beneath each
     tables       1pt solid #000 all round, 4.5pt cell padding, top aligned
     bullets      dash, not disc

   The template mixes Lexend on its cover with Arial inside. Lexend is used
   throughout here; reproducing that mismatch would read as an accident.

   Google Docs ignores stylesheets on import, so every rule is inline. */

import fs from 'node:fs';

const FONT = 'Lexend';

const S = {
  title: `font-family:${FONT};font-size:36pt;font-weight:700;color:#000000;line-height:1.15;text-align:center;margin:0;padding:0`,
  kicker: `font-family:${FONT};font-size:11pt;color:#666666;text-align:center;margin:0;padding:6pt 0 0 0`,
  h2: `font-family:${FONT};font-size:18pt;font-weight:700;color:#000000;line-height:1.0;text-align:left;margin:0;padding:11.2pt 0`,
  h3: `font-family:${FONT};font-size:14pt;font-weight:700;color:#000000;line-height:1.0;text-align:left;margin:0;padding:8pt 0 6pt 0`,
  p: `font-family:${FONT};font-size:11pt;color:#000000;line-height:1.15;margin:0;padding:0 0 8pt 0`,
  li: `font-family:${FONT};font-size:11pt;color:#000000;line-height:1.15;margin:0;padding:0 0 2pt 0`,
  link: `color:#1155cc;text-decoration:underline;font-size:19pt;font-family:${FONT}`,
  linkP: `font-size:11pt;line-height:1.0;margin:0;padding:0 0 12pt 0`,
  table: 'border-collapse:collapse;border-spacing:0;margin:4pt auto 12pt 0;width:100%',
  td: `border:1pt solid #000000;padding:4.5pt;vertical-align:top;font-family:${FONT};font-size:11pt;color:#000000`,
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return t;
}

const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const src = fs.readFileSync(process.argv[2], 'utf8');
const lines = src.split(/\r?\n/);

// --- pass one: collect the section headings the cover index will point at ---
const index = [];
for (const l of lines) {
  const m = l.match(/^##\s+(.*)$/);
  if (!m) continue;
  const t = m[1].trim();
  if (/^Stage \d/.test(t) || t === 'Troubleshooting') index.push(t);
}

// --- cover -----------------------------------------------------------------
const out = [];
out.push(`<p style="${S.title}">Shopify Theme Upload</p>`);
out.push(`<p style="${S.kicker}">Root &amp; Ritual Botanicals &middot; prepared by Hauck Marketing &middot; July 2026</p>`);
out.push('<hr>');

for (const t of index) {
  out.push(`<p style="${S.linkP}"><a href="#${anchor(t)}" style="${S.link}">${esc(t)}</a></p>`);
}
out.push('<hr>');

out.push(`<h2 style="${S.h2}">The Job at a Glance</h2>`);
const glance = [
  ['What you are installing', 'Five complete Shopify themes, one per design direction'],
  ['Each file', 'About 5 MB, 60 files, uploaded as a zip'],
  ['Total time', 'About 90 minutes, most of it typing product copy'],
  ['Steps', '103 tick boxes across eight stages'],
  ['Risk before publishing', 'None. Everything up to Stage 6 is a private draft.'],
  ['What you decide', 'Which one of the five directions goes live'],
  ['Must not be skipped', 'Stage 5a, the placeholder reviews'],
  ['Rollback', 'Re-publish the previous theme. About five seconds.'],
];
out.push(`<table style="${S.table}">`);
for (const [k, v] of glance) {
  out.push(`<tr><td style="${S.td};width:33%"><strong>${esc(k)}</strong></td><td style="${S.td}">${esc(v)}</td></tr>`);
}
out.push('</table>');
out.push(`<p style="${S.p}"><strong>Hauck Marketing LLC</strong></p>`);
out.push('<hr>');

// --- pass two: the body ----------------------------------------------------
let i = 0;
let list = null;
const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
const openList = (kind, style = '') => {
  if (list !== kind) { closeList(); out.push(`<${kind}${style}>`); list = kind; }
};

while (i < lines.length) {
  const line = lines[i];

  // table
  if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
    closeList();
    const head = line.split('|').slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) {
      rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
      i++;
    }
    out.push(`<table style="${S.table}">`);
    out.push('<tr>' + head.map((c) => `<td style="${S.td}"><strong>${inline(c)}</strong></td>`).join('') + '</tr>');
    for (const r of rows) {
      out.push('<tr>' + r.map((c, n) => `<td style="${S.td}">${n === 0 ? `<strong>${inline(c)}</strong>` : inline(c)}</td>`).join('') + '</tr>');
    }
    out.push('</table>');
    continue;
  }

  if (/^---+\s*$/.test(line)) { closeList(); out.push('<hr>'); i++; continue; }

  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    closeList();
    const text = h[2].trim();
    const lvl = h[1].length;
    // The markdown's H1 is the document title, already emitted on the cover.
    if (lvl === 1) { i++; continue; }
    if (lvl === 2) out.push(`<h2 style="${S.h2}"><a name="${anchor(text)}"></a>${inline(text)}</h2>`);
    else out.push(`<h3 style="${S.h3}">${inline(text)}</h3>`);
    i++;
    continue;
  }

  // Callouts become a bold lead-in paragraph, which is how the template
  // handles the same job. It has no shaded boxes and neither should this.
  if (/^>\s?/.test(line)) {
    closeList();
    const buf = [];
    while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
    buf.join('\n').split(/\n\s*\n/).filter((p) => p.trim()).forEach((p) => {
      out.push(`<p style="${S.p}">${inline(p.replace(/\n/g, ' '))}</p>`);
    });
    continue;
  }

  const cb = line.match(/^- \[ \]\s+(.*)$/);
  if (cb) {
    openList('ul', ' style="list-style:none;padding-left:18pt;margin:0"');
    out.push(`<li style="${S.li}">&#9744;&nbsp;&nbsp;${inline(cb[1])}</li>`);
    i++;
    continue;
  }

  const ol = line.match(/^(\d+)\.\s+(.*)$/);
  if (ol) {
    openList('ol', ' style="padding-left:22pt;margin:0"');
    out.push(`<li style="${S.li}">${inline(ol[2])}</li>`);
    i++;
    continue;
  }

  const li = line.match(/^[-*]\s+(.*)$/);
  if (li) {
    openList('ul', ' style="padding-left:22pt;margin:0"');
    out.push(`<li style="${S.li}">${inline(li[1])}</li>`);
    i++;
    continue;
  }

  if (!line.trim()) { closeList(); i++; continue; }

  closeList();
  out.push(`<p style="${S.p}">${inline(line)}</p>`);
  i++;
}
closeList();

// Blank lines between items split lists apart; stitch same-kind neighbours.
let html = out.join('\n');
let before;
do {
  before = html;
  html = html
    .replace(/<\/ol>\n<ol style="padding-left:22pt;margin:0">\n/g, '')
    .replace(/<\/ul>\n<ul style="list-style:none;padding-left:18pt;margin:0">\n/g, '')
    .replace(/<\/ul>\n<ul style="padding-left:22pt;margin:0">\n/g, '');
} while (html !== before);

fs.writeFileSync(process.argv[3], html, 'utf8');
console.log(`wrote ${process.argv[3]} (${html.length} bytes, ${index.length} index links)`);
