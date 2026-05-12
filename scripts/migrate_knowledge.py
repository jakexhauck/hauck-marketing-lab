#!/usr/bin/env python3
"""Migrate TFC knowledge markdown files into the Obsidian vault."""
import os
import re
import sys
from pathlib import Path

SRC = Path(r"C:\Users\games\Desktop\hauck-marketing-lab\media-buying\knowledge")
DST = Path(r"C:\Users\games\Desktop\hauck-marketing-lab\vault\Knowledge")
DST.mkdir(parents=True, exist_ok=True)

TFC_RE = re.compile(r"^TFC-\d{4}\.md$")
FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)

# Reserved keys we handle explicitly
RESERVED = {"id", "title", "tags", "type", "client", "agent"}


def parse_frontmatter(text: str):
    """Return (fm_dict_ordered_list, body). Tolerant to minor formatting."""
    m = FM_RE.match(text)
    if not m:
        return None, text
    fm_raw = m.group(1)
    body = m.group(2)
    pairs = []  # list of (key, raw_value)
    current_key = None
    current_val_lines = []
    for line in fm_raw.split("\n"):
        # detect "key: value" at top level (no leading space) — frontmatter is flat here
        km = re.match(r"^([A-Za-z0-9_\-]+)\s*:\s*(.*)$", line)
        if km and not line.startswith(" ") and not line.startswith("\t"):
            if current_key is not None:
                pairs.append((current_key, "\n".join(current_val_lines).strip()))
            current_key = km.group(1)
            current_val_lines = [km.group(2)]
        else:
            # continuation line
            if current_key is not None:
                current_val_lines.append(line)
    if current_key is not None:
        pairs.append((current_key, "\n".join(current_val_lines).strip()))
    return pairs, body


def quote_title(t: str) -> str:
    t = t.strip()
    # strip surrounding quotes if present
    if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
        inner = t[1:-1]
    else:
        inner = t
    if ":" in inner or "#" in inner or inner.startswith("-"):
        escaped = inner.replace('"', '\\"')
        return f'"{escaped}"'
    return inner


def parse_tags(raw: str):
    """Accept comma-separated OR list-form tags."""
    raw = raw.strip()
    if not raw:
        return []
    # YAML list inline form: [a, b, c]
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1]
        parts = [p.strip().strip('"').strip("'") for p in inner.split(",")]
        return [p for p in parts if p]
    # Block list form: lines starting with "- "
    if "\n" in raw and any(l.strip().startswith("-") for l in raw.split("\n")):
        out = []
        for l in raw.split("\n"):
            l = l.strip()
            if l.startswith("-"):
                t = l[1:].strip().strip('"').strip("'")
                if t:
                    out.append(t)
        return out
    # comma-separated string
    parts = [p.strip().strip('"').strip("'") for p in raw.split(",")]
    return [p for p in parts if p]


def format_tag_list(tags):
    safe = []
    for t in tags:
        if any(c in t for c in [",", "[", "]", ":", "#"]) or " " in t:
            safe.append('"' + t.replace('"', '\\"') + '"')
        else:
            safe.append(t)
    return "[" + ", ".join(safe) + "]"


def build_frontmatter(pairs, filename):
    d = {k: v for k, v in pairs}
    lines = ["---"]
    # id
    id_val = d.get("id", filename.replace(".md", ""))
    lines.append(f"id: {id_val.strip()}")
    # title
    title_val = d.get("title", id_val)
    lines.append(f"title: {quote_title(title_val)}")
    # tags
    tags = parse_tags(d.get("tags", ""))
    lines.append(f"tags: {format_tag_list(tags)}")
    # new fields
    lines.append("type: knowledge")
    lines.append("client: all")
    lines.append("agent: all")
    # preserve unknown keys (keep original order)
    seen = set()
    for k, v in pairs:
        if k in RESERVED or k in seen:
            continue
        seen.add(k)
        # write raw value; if multi-line, indent under the key
        if "\n" in v:
            lines.append(f"{k}: |")
            for ln in v.split("\n"):
                lines.append(f"  {ln}")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines)


def main():
    migrated = 0
    skipped = []
    errored = []
    files = sorted(os.listdir(SRC))
    for name in files:
        if not TFC_RE.match(name):
            if name != "_DIR_INDEX.md":
                skipped.append((name, "does not match TFC-####.md"))
            continue
        src_path = SRC / name
        try:
            text = src_path.read_text(encoding="utf-8")
        except Exception as e:
            errored.append((name, f"read failed: {e}"))
            continue
        try:
            pairs, body = parse_frontmatter(text)
            if pairs is None:
                # no frontmatter — synthesize
                pairs = [("id", name.replace(".md", "")), ("title", name.replace(".md", "")), ("tags", "")]
                body = text
            fm = build_frontmatter(pairs, name)
            # ensure body starts with a newline
            if not body.startswith("\n"):
                body = "\n" + body
            out = fm + body
            (DST / name).write_text(out, encoding="utf-8", newline="\n")
            migrated += 1
        except Exception as e:
            errored.append((name, f"transform failed: {e}"))

    print(f"MIGRATED: {migrated}")
    print(f"SKIPPED_NON_TFC: {len(skipped)}")
    for n, r in skipped:
        print(f"  - {n}: {r}")
    print(f"ERRORED: {len(errored)}")
    for n, r in errored:
        print(f"  - {n}: {r}")


if __name__ == "__main__":
    main()
