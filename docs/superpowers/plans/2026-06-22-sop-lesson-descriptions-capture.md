# SOP Lesson Descriptions Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is an interactive Playwright scrape run **inline** in the session (the Playwright MCP browser is a single shared instance; do not parallelize across subagents).

**Goal:** Capture the description text and attached docs/resources beneath all 123 Local Ads School lessons into the existing inventory file.

**Architecture:** Drive the already-logged-in Playwright MCP browser to each Skool lesson link, extract description text + resource links via a compact `browser_evaluate` (no full snapshots), download Skool-hosted files, append per-lesson description blocks below each course table, commit per batch.

**Tech Stack:** Playwright MCP (`mcp__playwright__*`), Skool web app, markdown.

## Global Constraints

- Source community: `skool.com/metaads`. Course A `f01a3e40` (18 lessons), Course B `bf48305a` (105 lessons).
- Output target: `docs/sop-source/local-ads-school-inventory.md` — existing tables stay as the index; description blocks appended under each course table in a `### Lesson descriptions` section.
- Attachments: Skool-hosted files → download to `docs/sop-source/attachments/<course-slug>/NN-slug.ext` and link local path + source URL. External links (Google Docs/Drive/Sheets/Loom/YouTube/tools) → link-only.
- Course slugs: `running-ads` (A), `masterclass` (B).
- No em dashes in any output. Lessons with no body → `_(no description / coming soon)_`.
- Out of scope: watching videos, writing SOPs.

---

### Task 1: Verify access and lock the extraction recipe

**Files:**
- Create: `docs/sop-source/attachments/running-ads/.gitkeep`
- Create: `docs/sop-source/attachments/masterclass/.gitkeep`
- Create: `docs/sop-source/_capture-run-log.md` (scratch run log: done / failed / skipped per lesson)

**Interfaces:**
- Produces: a confirmed `browser_evaluate` extractor that returns `{ description: string, links: [{name, href}] }` for a lesson page; the link-classification rule.

- [ ] **Step 1: Confirm Skool session is live.** Navigate to lesson 1 of Course A (`https://www.skool.com/metaads/classroom/f01a3e40?md=b60abe3f58564ca88c8d971842c8357c`). If redirected to a login/landing page, STOP and ask Jake to log in via `! ` then resume. Expected: the lesson page renders with video + description body.

- [ ] **Step 2: Take ONE snapshot** of that lesson to identify the DOM container holding the description text and the attachment/resource elements. Record the selectors. (This is the only full snapshot taken in the whole run.)

- [ ] **Step 3: Write the extractor** as a `browser_evaluate` body that returns compact JSON: the description container's innerText (trimmed) plus every `<a>` inside it (and any dedicated attachment list) as `{name, href}`. Run it on lesson 1.
Expected: clean description text + zero or more links, no page chrome.

- [ ] **Step 4: Validate on a known-attachment lesson.** Run the extractor on lesson 2 of Course A ("Campaign Prep with CO-pilot", `md=8fd199f28e7048dfa514c139e9d090c5`), which is likely to have a prompt doc.
Expected: description + at least one link. Confirm the classifier: `skool.com`/file-CDN href → download candidate; everything else → link-only.

- [ ] **Step 5: Commit scaffolding.**

```bash
git add docs/sop-source/attachments docs/sop-source/_capture-run-log.md
git commit -m "chore: scaffold attachments dirs + run log for lesson capture"
```

---

### Task 2: Append the description-section skeleton to the inventory

**Files:**
- Modify: `docs/sop-source/local-ads-school-inventory.md`

**Interfaces:**
- Consumes: nothing. Produces: a `### Lesson descriptions` heading directly under each course table (Course A after its table; each Course B module table keeps its own following the module, OR one consolidated `### Lesson descriptions` per course — use one per course, lessons listed by global number).

- [ ] **Step 1:** Under Course A's table (after line ~45), insert a `### Lesson descriptions` heading. Under Course B (after the final module table, line ~226), insert a `### Lesson descriptions` heading. Leave them empty for now.

- [ ] **Step 2: Commit.**

```bash
git add docs/sop-source/local-ads-school-inventory.md
git commit -m "docs: add lesson-descriptions sections to inventory"
```

---

### Task 3..N: Scrape in batches of ~15 lessons

Repeat the following loop for each batch until all 123 lessons are done. Batch boundaries (by global lesson #): A1-18, then B 1-15, 16-30, 31-45, 46-60, 61-75, 76-90, 91-105. That is 1 batch for Course A + 7 batches for Course B = 8 batches.

**Files (each batch):**
- Modify: `docs/sop-source/local-ads-school-inventory.md` (append blocks)
- Create: `docs/sop-source/attachments/<course>/NN-slug.ext` (per downloaded file)
- Modify: `docs/sop-source/_capture-run-log.md`

**Interfaces:**
- Consumes: the extractor + classifier from Task 1.

- [ ] **Step 1:** For each lesson in the batch, navigate to its `skool` link, run the extractor.
- [ ] **Step 2:** Classify links. Download Skool-hosted files into the course's attachments folder named `NN-slug.ext` (NN = global lesson number, slug from title). External links → keep as URLs.
- [ ] **Step 3:** Append the lesson block under the course's `### Lesson descriptions` section:

```
#### <#>. <Lesson title>
<description text, or _(no description / coming soon)_>

Attachments:
- [<name>](../attachments/<course>/NN-slug.ext) · source: <url>
- [<name>](<external url>)
```
(omit `Attachments:` if none)

- [ ] **Step 4:** Update `_capture-run-log.md` with done/failed/skipped for each lesson in the batch.
- [ ] **Step 5: Verify** the inventory still renders (tables intact, blocks well-formed), then commit:

```bash
git add docs/sop-source/local-ads-school-inventory.md docs/sop-source/attachments docs/sop-source/_capture-run-log.md
git commit -m "docs: capture lesson descriptions batch <range>"
```

- [ ] **Step 6:** If the session logged out mid-batch, STOP, ask Jake to re-auth via `! `, resume from the next undone lesson per the run log.

---

### Task Final: Completeness verification

**Files:**
- Modify: `docs/sop-source/_capture-run-log.md`

- [ ] **Step 1:** Confirm all 123 lessons appear in the run log with a status. List any `failed`/`skipped` and retry them once.
- [ ] **Step 2:** Confirm every downloaded attachment path resolves to a real file; every external resource is a link.
- [ ] **Step 3:** Report the tally to Jake (captured / no-description / failed, attachment count). Then we plan step 2 (triage + watch + write SOPs).
- [ ] **Step 4: Final commit** if the run log changed.

```bash
git add docs/sop-source/_capture-run-log.md
git commit -m "docs: finalize lesson-descriptions capture run log"
```
