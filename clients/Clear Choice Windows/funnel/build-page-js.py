# Regenerate the GHL stub script from index.html:
#   python build-page-js.py index.html ../../../apps/command-center/public/sites/clear-choice-windows/lp/page.js

import re, sys, json

src, out = sys.argv[1], sys.argv[2]
h = open(src, encoding="utf-8").read()
BASE = "https://app.hauckmarketing.com/sites/clear-choice-windows/lp/img/"

head = h[h.index("<head>") + 6 : h.index("</head>")]
body = h[h.index("<body>") + 6 : h.index("</body>")]

css = re.findall(r"<style>(.*?)</style>", head, flags=re.S)
assert len(css) == 1
fonts = "@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap');\n"
# Same flattening in CSS for the GHL levels that have names, plus a dark page
# background so any gap left over reads as the page, not white.
ghl = """
.c-section, .c-wrapper, .c-row, .c-column, .c-element, .hl_page-preview--content,
.section-wrap, .row-wrap, .col-wrap, .inner, .container, .fullSection, .fullRow {
  padding: 0 !important; margin: 0 !important; max-width: 100% !important;
  background-color: transparent !important; border: 0 !important;
}
html, body { background-color: #0F2219 !important; margin: 0 !important; padding-top: 0 !important; }
"""
css = fonts + css[0] + ghl

pixel = re.search(r"<!-- Meta Pixel:.*?<script>(.*?)</script>", head, flags=re.S).group(1)

body = re.sub(r"<noscript>.*?</noscript>\n?", "", body, flags=re.S)
scripts = re.findall(r"<script>(.*?)</script>", body, flags=re.S)
html = re.sub(r"\s*<script>.*?</script>", "", body, flags=re.S).strip()

def fix(s):
    return s.replace('src="img/', 'src="' + BASE).replace("'img/", "'" + BASE)
html, css = fix(html), fix(css)
scripts = [fix(s) for s in scripts]
assert not re.search(r"""["'(]img/""", html + css + "".join(scripts))

js = f"""// CLEAR CHOICE WINDOWS OWENSBORO: free triple pane landing page.
// GENERATED from clients/Clear Choice Windows/funnel/index.html. Edit that file and
// regenerate; do not hand-edit this one.
//
// GHL holds a two-line stub in one Custom Code element:
//   <div id="cc-lp"></div>
//   <script src="https://app.hauckmarketing.com/sites/clear-choice-windows/lp/page.js"></script>
// The Meta Pixel is in here. Never also add it in the funnel's Tracking Code.

(function () {{
  var root = document.getElementById("cc-lp");
  if (!root) {{ root = document.createElement("div"); root.id = "cc-lp"; document.body.appendChild(root); }}
  var st = document.createElement("style");
  st.textContent = {json.dumps(css)};
  document.head.appendChild(st);
  root.innerHTML = {json.dumps(html)};

  // GHL wraps the code element in section/row/column/element levels, each with
  // its own padding, max-width and white background, some not editable in the
  // builder. Inline !important beats any theme rule and reaches every level.
  for (var n = root.parentElement; n && n !== document.body; n = n.parentElement) {{
    ["padding", "margin-top", "margin-bottom", "margin-left", "margin-right"].forEach(function (p) {{
      n.style.setProperty(p, "0", "important");
    }});
    n.style.setProperty("max-width", "none", "important");
    n.style.setProperty("width", "100%", "important");
    n.style.setProperty("background-color", "transparent", "important");
    n.style.setProperty("border", "0", "important");
  }}
}})();

// Meta Pixel
{pixel.strip()}

""" + "\n\n".join(s.strip() for s in scripts) + "\n"

if "—" in js:
    raise SystemExit("em dash")
open(out, "w", encoding="utf-8").write(js)
print("ok", len(js), "chars,", len(scripts), "scripts")
