import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { validateStepPatch } from "../../../../../src/lib/setupSteps";

// PATCH/DELETE /api/admin/onboarding/steps/:id  (admin-only)
//
// Edit or retire one step. What may be written is decided by validateStepPatch,
// not by this file: `code` and `archived` are unreachable from a PATCH, so
// renaming a step can never steal another one's live-check wiring.

const SELECT = "id, section, group_label, label, note, position, required, code";

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const id = ctx.params.id as string;

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { patch, error: invalid } = validateStepPatch(body);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const { data, error } = await client
    .from("setup_steps")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "no such step" }, { status: 404 });

  await logAdminAction(client, ctx.data.admin!.id, "setup-step.update", null, {
    stepId: id,
    fields: Object.keys(patch),
  });

  const row = data as Record<string, unknown>;
  return Response.json({
    ok: true,
    step: {
      id: row.id,
      section: row.section,
      groupLabel: row.group_label,
      label: row.label,
      note: row.note,
      position: row.position,
      required: row.required,
      code: row.code,
    },
  });
};

// DELETE — retire a step.
//
// Archived, never actually deleted. A client who ticked it has a row in
// onboarding_checklist pointing at this id, and deleting the step would leave
// that tick pointing at nothing. Archived, it simply stops appearing, and the
// history of what that client did stays true.
export const onRequestDelete: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const id = ctx.params.id as string;

  const { data, error } = await client
    .from("setup_steps")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, label")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "no such step" }, { status: 404 });

  await logAdminAction(client, ctx.data.admin!.id, "setup-step.archive", null, {
    stepId: id,
    label: (data as { label: string }).label,
  });

  return Response.json({ ok: true });
};
