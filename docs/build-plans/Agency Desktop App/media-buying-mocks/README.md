# Media-Buying UX · 5 Mockup Directions

Standalone HTML mockups of how the media-buying flow could feel inside HML, from the moment a client finishes onboarding to ads running live in Meta. Open each file directly in a browser to evaluate. Pick a direction, the rest get deleted.

Realistic placeholder data throughout: client is **Sunrise HVAC** (Austin), offer is **$49 21-point AC tune-up**, three campaigns and twelve ads launched as an offer-testing grid.

## The 5 directions

### 01 · Mission Control Cockpit
**Paradigm:** Single dense screen, no nav. Left rail = campaign tree, center = ad editor, right = live Meta preview + status. Bloomberg terminal meets Figma. Dark theme, terminal monospace data.
**Wins when:** Zero context-switching, every field visible at once, keyboard-first power use. Best daily-driver for hands-on every step.
**Falls down when:** First-time use feels overwhelming. Real estate gets tight on small monitors.

### 02 · Spreadsheet Grid (Bulk Forge)
**Paradigm:** Excel/Linear-style table. Rows = ads, columns = every field including inline creative thumbs. Multi-select rows for bulk AI-fill and bulk publish. Cream/ink minimalism.
**Wins when:** Editing 12 ads at once, reading metrics in tabular comparison, spreadsheet muscle memory pays off, batch operations.
**Falls down when:** Creative-heavy work, anything that needs visual context bigger than a 36px thumbnail.

### 03 · Conveyor Belt Kanban
**Paradigm:** Pipeline stages as columns (Brief → Copy → Creative → Targeting → Review → Live). Cards move left to right. Industrial blueprint aesthetic, graph-paper background.
**Wins when:** Surfacing where every ad is in the pipeline, flagging bottlenecks, working asynchronously across stages. Process visibility.
**Falls down when:** Comparing ads against each other, quick all-edit batch work, single-ad deep dives.

### 04 · Document Brief (Notion-style)
**Paradigm:** Each campaign reads top-to-bottom like a written brief. Every block is interactive: regen hooks, swap creative, edit audience. Slash commands. Editorial magazine feel, Fraunces display serif.
**Wins when:** Strategy + copy in the same view, sharing the brief with a client, working in narrative mode, deliberate copywriting.
**Falls down when:** Rapid batch editing, ops-mode work, comparing variants side by side.

### 05 · Variant Forge (Card Stack)
**Paradigm:** Generate 30 ad variants in one click. Tinder-swipe to keep/kill. Survivors auto-assemble into the testing grid. Maximalist arcade aesthetic. Pruning UX, not construction UX.
**Wins when:** Volume-first creative testing, you trust AI generation enough to curate rather than draft, fastest blank-slate to multiple live ads.
**Falls down when:** Hand-crafted single-ad work, tight client-voice copy that demands deliberate writing, fine-grained targeting work.

## How to pick

The directions are not exclusive. The likely winner combines two: a primary daily-driver (where you live) plus a secondary mode for batch work.

Strong candidate pairs:
- **Cockpit + Spreadsheet** (precision daily + bulk operations)
- **Document + Variant Forge** (strategy + volume)
- **Conveyor + Cockpit** (process visibility + execution)

Open all five back to back. The one that makes you reach for the keyboard fastest is probably the right primary.

---

# 06 · Campaign Skeleton Visualization (separate view)

A different question from the 5 above: how do you *see* the structure that the media-buying form is building? These 3 mockups live behind a button inside the media-buying workflow. They render the Learning Phase Campaign shape (1 campaign → 2 ad sets, Broad + Interest → 3 ads each = 6 ad slots, testing audience not creative) and update as the form fills.

All three share the same data and the same dark + colored-folder aesthetic from the reference screenshot (blue = campaign, purple = ad set, green = ad).

### 06-A · Folder Tree
**Paradigm:** Direct adaptation of the reference. Indented tree, expandable rows, each ad expands into a detail card (thumbnail · angle · hook · body · CTA · status). Empty slots show dashed icons and "[awaiting ...]" placeholders.
**Wins when:** You want every detail visible in one scroll. Closest to the source image. Best for "is anything missing?" scans.
**Falls down when:** Long ad lists, or when you want to focus on one ad without the rest screaming at you.

### 06-B · Vertical Flowchart
**Paradigm:** Org-chart style. Campaign node at top, branches DOWN to two ad-set nodes side-by-side, each branching down to its 3 ad cards. Glowing connectors. A "SAME 3 ADS · TESTING AUDIENCE NOT CREATIVE" bridge label between the two columns drives home the testing thesis.
**Wins when:** Explaining the campaign shape to a client or your future self. Most visually striking, most "ad architect." The connector geometry teaches the structure on first look.
**Falls down when:** You have more than 2 ad sets or more than 3 ads each — gets wide fast.

### 06-C · Split Inspector (3-column + detail)
**Paradigm:** Four panels. Column 1 = campaign list (1 row). Column 2 = ad sets of selected campaign. Column 3 = ads of selected ad set. Right pane = full inspector for the selected ad: ad-platform preview card on the left, every field on the right, plus where-it-lives breadcrumb pills.
**Wins when:** You want to drill into one ad while keeping the whole skeleton on screen. The preview card shows what Meta will actually render. Most "production tool."
**Falls down when:** First-time learning of the skeleton shape — the relationships are implied by columns rather than drawn.

### How to pick this one

Open all three. The question to ask: **when you click the button mid-form, what do you want to see first?**
- "Everything, top to bottom" → A
- "The shape of what I'm building" → B
- "The one ad I'm currently editing, in context" → C

A + B is a defensible pair (A as the default expanded view, B as a "shape view" toggle). C is the strongest standalone if the visualization doubles as a live edit surface.
