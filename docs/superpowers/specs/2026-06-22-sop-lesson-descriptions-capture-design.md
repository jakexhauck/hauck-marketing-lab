# SOP Lesson Descriptions Capture — Design

Date: 2026-06-22
Status: Approved (design), pending implementation plan

## Goal

Capture the written **description text** and **attached docs/resources** that sit beneath every video lesson in the two Local Ads School courses already mapped in `docs/sop-source/local-ads-school-inventory.md`, so we have the full source material (the instructor's notes + provided docs) before we triage and write step-by-step SOPs.

This is **step 1** of a two-step effort:
- **Step 1 (this spec):** scrape descriptions + attachments for all 123 lessons.
- **Step 2 (later, separate plan):** watch the videos and write the actual step-by-step SOPs.

Watching videos and writing SOPs is explicitly **out of scope** here.

## Scope

All **123 lessons** across both target courses:
- **Course A — Month 1: Running ads** — 18 lessons (`f01a3e40`)
- **Course B — The Original Local META Ads Masterclass** — 105 lessons across 13 sections (`bf48305a`)

Source: `skool.com/metaads`. Both `skool` lesson links already exist for every row in the inventory.

## Output format

Everything lands in the existing `docs/sop-source/local-ads-school-inventory.md`. For each course:

1. The existing lesson **table stays as-is** and serves as the quick index.
2. A new `### Lesson descriptions` section is appended **below each course's table**, with one block per lesson:

```
#### <#>. <Lesson title>
<exact description text from the Skool lesson page>

Attachments:
- [<resource name>](<../attachments/<course>/NN-slug.ext>) · source: <original url>   ← downloaded file
- [<resource name>](<external url>)   ← link-only (Google Doc/Drive/Sheet/Loom)
```

- Lessons with no description or a "Coming Soon" placeholder are marked `_(no description / coming soon)_` rather than left blank.
- Lessons with no attachments omit the `Attachments:` block.

## Attachment handling

- **Real file attachments** hosted by Skool (PDF, docx, images uploaded to the lesson): download into
  `docs/sop-source/attachments/<course-slug>/NN-slug.ext` and link the local relative path, keeping the source URL.
- **External links** (Google Docs/Drive/Sheets, Loom, YouTube, third-party tools): capture name + URL as **link-only**. These cannot be reliably downloaded through the browser, and per Jake the link is sufficient.

Course slugs for the attachments folders: `running-ads` (Course A), `masterclass` (Course B).

## Capture method

The Skool browser session was logged in on 2026-06-21 (the inventory itself was captured this way). Verify access first.

Per lesson:
1. Navigate the existing Playwright browser to the lesson's `skool` link.
2. Run a small `browser_evaluate` that returns **only** the description text plus every attachment/resource link (name + href) as compact JSON. This avoids dumping full page snapshots into context, keeping 123 pages affordable.
3. Classify each link: Skool-hosted file → download; external → link-only.
4. Download qualifying files to the attachments folder.
5. Append the lesson's description block beneath its course table.

## Resilience

- Process in **batches of ~15 lessons**. After each batch, append to the inventory and commit, so the work is resumable if Skool logs out or a page hangs.
- Maintain a short run log (done / failed / skipped per lesson) so nothing is silently dropped.
- If the session is logged out, stop and surface it (Jake logs in via `!`), then resume.

## Success criteria

- Every one of the 123 lessons has either a captured description block or an explicit "no description / coming soon" marker.
- Every downloadable Skool-hosted attachment is saved locally and linked; every external resource is captured as a link.
- The inventory file remains valid markdown (tables intact, description sections appended below).
- No videos watched, no SOPs written (that is step 2).
