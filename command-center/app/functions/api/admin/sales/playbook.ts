import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  cleanHint,
  cleanPrompt,
  isPlaybookSection,
  type PlaybookSectionId,
} from "../../../lib/salesPlaybook";

// GET    /api/admin/sales/playbook -> every prompt, in section and sort order
// POST   /api/admin/sales/playbook -> add one to the bottom of a section (owner)
// PATCH  /api/admin/sales/playbook -> reword / rehint / reorder / retire (owner)
// DELETE /api/admin/sales/playbook -> remove one outright               (owner)
//
// The prompts drawn in the three columns of Sales > On Call, and edited on
// Sales > Playbook. Migration 0074.
//
// Two things are worth stating plainly because they are the reason this file is
// shorter than its cold-call cousin:
//
//   1. prompt and hint are PLAIN TEXT. Nothing renders them as markup, so there
//      is no sanitizer here and there must never be a page that needs one. The
//      guard is cleanPrompt/cleanHint, which cap the length and flatten control
//      characters, and that is the whole of it.
//   2. Nothing counts these. A prompt is not the unit of a test the way a cold
//      call script variation is, so there are no derived stats on the read and
//      no reason a delete has to be refused to protect a history.
//
// /api/admin/sales/ is not in any non-owner role's allowlist
// (functions/lib/adminRoles.ts), so a hired role cannot reach this at all. The
// owner check on each write is the second lock on the same door, matching the
// cold-call assets endpoint.

const SELECT = "id, section, prompt, hint, sort_order, archived_at";

interface ItemRow {
  id: string;
  section: string;
  prompt: string;
  hint: string;
  sort_order: number;
  archived_at: string | null;
}

function shape(row: ItemRow) {
  return {
    id: row.id,
    section: row.section as PlaybookSectionId,
    prompt: row.prompt,
    hint: row.hint,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

function ownerOnly(ctx: { data: ApiData }): Response | null {
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  // On Call wants the live prompts only. The management page asks for
  // everything, so a retired prompt can still be read and put back.
  const includeArchived = url.searchParams.get("archived") === "1";

  let query = client.from("sales_playbook_items").select(SELECT);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[sales/playbook] read failed", error.message);
    return Response.json({ error: "could not read the playbook" }, { status: 500 });
  }

  return Response.json({ items: ((data ?? []) as ItemRow[]).map(shape) });
};

interface PostBody {
  section?: unknown;
  prompt?: unknown;
  hint?: unknown;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  if (!isPlaybookSection(body.section)) {
    return Response.json({ error: "bad_section" }, { status: 400 });
  }
  const prompt = cleanPrompt(body.prompt);
  if (!prompt) {
    return Response.json(
      { error: "Write the prompt itself, otherwise there is nothing to read." },
      { status: 400 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  // New prompts go to the bottom of their own section. Reading the current
  // maximum is a race in theory and not in practice: one owner, one page.
  const { data: last } = await client
    .from("sales_playbook_items")
    .select("sort_order")
    .eq("section", body.section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await client
    .from("sales_playbook_items")
    .insert({
      section: body.section,
      prompt,
      hint: cleanHint(body.hint),
      sort_order: sortOrder,
      updated_by: adminId,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    console.error("[sales/playbook] insert failed", error?.message);
    return Response.json({ error: "could not add that" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "sales.playbook.create", null, {
    section: body.section,
    prompt,
  });

  return Response.json({ item: shape(data as ItemRow) }, { status: 201 });
};

interface PatchBody {
  id?: unknown;
  prompt?: unknown;
  hint?: unknown;
  sortOrder?: unknown;
  // true retires, false puts it back. Absent leaves it alone.
  archived?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // Only the fields actually sent are touched, so the autosaving editor can
  // PATCH a prompt alone without clearing the hint beside it.
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.data.admin!.id,
  };

  if (body.prompt !== undefined) {
    const prompt = cleanPrompt(body.prompt);
    if (!prompt) {
      return Response.json(
        { error: "Write the prompt itself, otherwise there is nothing to read." },
        { status: 400 },
      );
    }
    patch.prompt = prompt;
  }
  if (body.hint !== undefined) patch.hint = cleanHint(body.hint);
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isFinite(n)) return Response.json({ error: "bad_sort" }, { status: 400 });
    patch.sort_order = Math.trunc(n);
  }
  if (body.archived !== undefined) {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  const { data, error } = await client
    .from("sales_playbook_items")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    console.error("[sales/playbook] update failed", error.message);
    return Response.json({ error: "could not save that" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({ item: shape(data as ItemRow) });
};

interface DeleteBody {
  id?: unknown;
}

// A real delete, unlike the cold-call shelf.
//
// Retiring is the right move for a prompt Jake used for a month and has stopped
// using, and the page offers that first. This is for the row added by mistake
// thirty seconds ago: nothing anywhere counts prompts, so removing one orphans
// no history.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<DeleteBody>(ctx.request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { error } = await client.from("sales_playbook_items").delete().eq("id", id);
  if (error) {
    console.error("[sales/playbook] delete failed", error.message);
    return Response.json({ error: "could not remove that" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "sales.playbook.delete", null, { id });

  return Response.json({ ok: true });
};
