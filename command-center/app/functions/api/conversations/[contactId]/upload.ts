import type { Env, ApiData } from "../../../lib/env";
import { ghlUploadAttachment } from "../../../lib/ghl";
import { isInternalContact } from "../../../lib/messaging";
import { isClientVisibleContact } from "../../../lib/handoffScope";
import { logErrorBestEffort } from "../../../lib/errorLog";

// POST /api/conversations/<contactId>/upload  (multipart: file)
//
// The Inbox photo button. Hands one picture to GHL, which hosts it, and returns
// its URL; the composer then sends it with send.ts as `attachments`. Same two
// guards as send.ts: no sink, no lead the setter is still working.
//
// The browser shrinks photos before they get here, so 5 MB (GHL's cap) is a
// backstop, not the usual path.

const MAX_BYTES = 5 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = String(ctx.params.contactId ?? "");
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  if (await isInternalContact(gctx, contactId, t.internal_recipients)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (
    !(await isClientVisibleContact(gctx, t.client_inbox_pipeline_id, contactId, t.inbox_visible_tag, t.inbox_show_ad_leads))
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await ctx.request.formData();
    const f = form.get("file");
    file = f && typeof f !== "string" ? (f as File) : null;
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  if (!file || file.size === 0) return Response.json({ error: "no_file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "not_an_image" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  try {
    const urls = await ghlUploadAttachment(gctx, contactId, file);
    if (urls.length === 0) throw new Error("upload returned no url");
    return Response.json({ url: urls[0] });
  } catch (err) {
    logErrorBestEffort(ctx.env, "inbox-upload", String(err), { locationId: t.ghl_location_id, contactId });
    return Response.json({ error: "upload_failed" }, { status: 502 });
  }
};
