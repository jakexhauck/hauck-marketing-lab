"""Build a sales-call brief.

Usage: python build.py <slug>

Reads   agency/briefs/src/<slug>/brief.html  (artifact-style fragment, {{IMG:relative/path.jpg}} placeholders)
Writes  agency/briefs/public/<slug>/index.html  (full standalone page, images inlined, noindex)
        agency/briefs/src/<slug>/artifact.html   (same content as a fragment, for the private claude.ai preview)
"""
import base64
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def main(slug: str) -> None:
    src_dir = ROOT / "agency" / "briefs" / "src" / slug
    html = (src_dir / "brief.html").read_text(encoding="utf-8")

    def inline(m: re.Match) -> str:
        path = src_dir / m.group(1)
        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()

    html = re.sub(r"\{\{IMG:([^}]+)\}\}", inline, html)
    if "{{" in html:
        sys.exit("Unfilled {{placeholder}} left in brief.html")
    if "—" in html:
        sys.exit("Em dash found in brief.html. Replace it.")

    (src_dir / "artifact.html").write_text(html, encoding="utf-8")

    head, body = html.split("</style>", 1)
    head = head.replace("body { background:", "body { margin: 0; background:", 1)
    page = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        f"{head}</style>\n</head>\n<body>{body}</body>\n</html>\n"
    )
    out = ROOT / "agency" / "briefs" / "public" / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page, encoding="utf-8")
    print(f"built {out / 'index.html'} ({len(page):,} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
