import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// POST /api/admin/setter/tags (admin-only, gated in _middleware.ts). Adds
// and/or removes tags on a live CRM contact. These tags fire that client's
// automations, so this is the riskiest write in the Setter Suite: it MUST
// use getGhlContextForTenant, which THROWS on a half-configured tenant rather
// than resolving to anything, and it MUST re-read the contact after writing
// rather than echo the
// request, so the setter sees what the CRM actually holds.
//
// ADD is proven live: POST /contacts/{id}/tags {"tags":[...]} -> 201,
// tagsAdded (functions/api/reviews/index.ts:170 uses the same call style).
// REMOVE is proven live too: DELETE /contacts/{id}/tags {"tags":[...]} ->
// 200, tagsRemoved, confirmed gone on re-read. The GHL CLI's remove
// (gohighlevel_cli.py) sends no body and silently drops its tags argument;
// do not copy it.

export interface TagsBody {
  tenantId?: string;
  contactId?: string;
  add?: string[];
  remove?: string[];
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

// Trim and drop blanks; a caller that sends only whitespace tags has really
// sent nothing.
function cleanTags(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

// Pure, split out so it is unit-testable without a request.
export function validateTagsBody(body: TagsBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
  }
  if (!body.contactId || !body.contactId.trim()) {
    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
  }
  if (cleanTags(body.add).length === 0 && cleanTags(body.remove).length === 0) {
    return { ok: false, code: "nothing_to_do", error: "add or remove must contain at least one tag" };
  }
  return { ok: true };
}

interface GhlContactTagsResponse {
  contact?: { tags?: string[] };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<TagsBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateTagsBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const tenantId = body.tenantId!.trim();
  const contactId = body.contactId!.trim();
  const add = cleanTags(body.add);
  const remove = cleanTags(body.remove);

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    // Fixed order: remove first, then add. A tag present in both lists ends
    // up added (add wins), rather than the outcome depending on request-body
    // key order.
    if (remove.length) {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tags: remove }),
      });
    }
    if (add.length) {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: add }),
      });
    }

    // Re-read so the setter sees what the CRM actually holds, not an echo of
    // the request: these tags fire live automations, so the real state is
    // what matters.
    const data = await ghlJson<GhlContactTagsResponse>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const tags = data.contact?.tags ?? [];

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.tags", tenantId, {
        contactId,
        add,
        remove,
      });
    }

    return Response.json({ tags });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
