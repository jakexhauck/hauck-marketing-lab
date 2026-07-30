import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { isValidFileId, DriveNotConnectedError } from "../../../../lib/driveDirect";
import {
  exportDocHtml,
  exportDocTabHtml,
  getFileMeta,
  listDocTabs,
  resolveDriveAccount,
} from "../../../../lib/driveComposio";
import { cleanDocHtml, extractTitle } from "../../../../lib/sopHtml";
import { DOC_MIME } from "../../../../lib/sopTree";

// GET /api/admin/sops/doc/:fileId — one SOP, rendered.
//
// Answers SECTIONS, not one blob of markup. A Google Doc can hold several tabs,
// and Drive's export concatenates them with no titles and no boundaries: five
// separate cold-call scripts arrived as one 90-paragraph wall with nothing
// marking where one ended. So a multi-tab Doc is fetched a tab at a time and
// returned as titled sections. A single-tab Doc is one section, and costs the
// same single export it always did.
//
// Drive is reached through Composio (see driveComposio.ts). The markup is
// Google's own HTML export either way, which is why cleanDocHtml is untouched by
// that swap.
//
// Admin-only: gated centrally in api/_middleware.ts.

// Bumped whenever the cached SHAPE or the rendered markup changes, because the
// cache key was Drive's modifiedTime alone: a Doc nobody had edited kept serving
// output from the OLD renderer forever. That bit immediately. Fixing the
// sanitizer to keep bold changed nothing on screen, because every SOP was
// answered from a row rendered before the fix. Baking the version into the key
// means an improved renderer invalidates itself instead of needing rows deleted
// by hand.
const RENDER_VERSION = "r3-tabs";

interface DocSection {
  title: string | null;
  depth: number;
  html: string;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const fileId = String(ctx.params.fileId ?? "");
  if (!isValidFileId(fileId)) {
    return Response.json({ error: "invalid file id" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  try {
    const accountId = await resolveDriveAccount(ctx.env);

    const meta = await getFileMeta(ctx.env, accountId, fileId);
    if (!meta) return Response.json({ error: "not found" }, { status: 404 });
    // Only Docs render as SOP pages. Anything else is an attachment and belongs
    // in Drive, so refuse rather than exporting something unreadable.
    if (meta.mimeType !== DOC_MIME) {
      return Response.json({ error: "not a Google Doc" }, { status: 415 });
    }

    // The stored key is the Drive revision AND the renderer, so either changing
    // re-renders.
    const cacheKey = `${meta.modifiedTime ?? ""}#${RENDER_VERSION}`;

    const { data: cached } = await client
      .from("sop_doc_cache")
      .select("html, title, modified_time")
      .eq("file_id", fileId)
      .maybeSingle();

    if (cached && cached.modified_time === cacheKey) {
      const sections = readCachedSections(cached.html);
      if (sections) {
        return Response.json({ title: cached.title ?? meta.name, sections, cached: true });
      }
      // Unreadable row: fall through and re-render rather than serving nothing.
    }

    const { title, sections } = await render(ctx.env, accountId, fileId, meta.name);

    // A cache write failing must not fail the read: the SOP is already rendered.
    await client
      .from("sop_doc_cache")
      .upsert(
        {
          file_id: fileId,
          modified_time: cacheKey,
          title,
          // The sections array, JSON-encoded into the existing text column.
          // Deliberate: the shape is versioned by RENDER_VERSION above, so this
          // needed no migration and no coordination with a live deploy. Always
          // read it back through readCachedSections.
          html: JSON.stringify(sections),
          cached_at: new Date().toISOString(),
        },
        { onConflict: "file_id" },
      );

    return Response.json({ title, sections, cached: false });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not open that SOP.";
    return Response.json({ error: message }, { status: 500 });
  }
};

async function render(
  env: Env,
  accountId: string,
  fileId: string,
  fallbackName: string,
): Promise<{ title: string; sections: DocSection[] }> {
  // Returns [] for a single-tab Doc, which is the common case.
  let tabs: Awaited<ReturnType<typeof listDocTabs>> = [];
  try {
    tabs = await listDocTabs(env, accountId, fileId);
  } catch {
    // The Docs API refusing must not cost us the SOP. Falling back to the plain
    // export means a multi-tab Doc reads as one run-on section, which is how it
    // read before any of this: degraded, not broken.
  }

  if (tabs.length === 0) {
    const raw = await exportDocHtml(env, accountId, fileId);
    return {
      title: extractTitle(raw) ?? fallbackName,
      // A single-tab Doc has no tab worth naming, so the section is untitled and
      // the reader shows the document title alone.
      sections: [{ title: null, depth: 0, html: cleanDocHtml(raw) }],
    };
  }

  const sections: DocSection[] = [];
  let firstRaw = "";
  for (const tab of tabs) {
    let raw: string;
    try {
      raw = await exportDocTabHtml(env, accountId, fileId, tab.id);
    } catch {
      // One tab failing must not lose the other six. Skipping it silently would
      // be the concatenation problem again, so the gap is stated on the page.
      sections.push({
        title: tab.title,
        depth: tab.depth,
        html: "<p>This tab could not be read from Drive. Open it in Drive to see it.</p>",
      });
      continue;
    }
    if (!firstRaw) firstRaw = raw;
    sections.push({ title: tab.title, depth: tab.depth, html: cleanDocHtml(raw) });
  }

  return { title: extractTitle(firstRaw) ?? fallbackName, sections };
}

// Rows written before this shape held bare markup, and a JSON.parse of that
// throws. Anything unreadable returns null so the caller re-renders.
function readCachedSections(stored: string | null): DocSection[] | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (s): s is DocSection => s && typeof s === "object" && typeof s.html === "string",
    );
  } catch {
    return null;
  }
}
