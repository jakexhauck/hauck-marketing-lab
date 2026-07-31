import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import {
  isSetupSection,
  seedRows,
  validateStepPatch,
} from "../../../../../src/lib/setupSteps";

// /api/admin/onboarding/steps  (admin-only, gated in _middleware.ts)
//
// The client setup checklist itself, as opposed to one client's ticks against
// it. Edited on Onboarding > Management, read by every Client setup page.

const SELECT = "id, section, group_label, label, note, position, required, code";

interface Row {
  id: string;
  section: string;
  group_label: string | null;
  label: string;
  note: string | null;
  position: number;
  required: boolean;
  code: string | null;
}

function view(row: Row) {
  return {
    id: row.id,
    section: row.section,
    groupLabel: row.group_label,
    label: row.label,
    note: row.note,
    position: row.position,
    required: row.required,
    code: row.code,
  };
}

// GET — every live step, in order.
//
// Seeds itself, per section. A section with no row at all has never been looked
// at, and the right starting point is Jake's real process rather than a blank
// page he would have to type in from memory.
//
// Per section, rather than only when the whole table is empty, so adding a
// section to the code list arrives on the next page load instead of needing a
// migration to carry twenty rows of English into SQL. A section already in the
// table is never touched, including one whose steps have all been archived: the
// test is whether any row has ever existed, so deleting a step you did not want
// is permanent, as deleting should be.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const read = async () =>
    client
      .from("setup_steps")
      .select(SELECT)
      .eq("archived", false)
      .order("section", { ascending: true })
      .order("position", { ascending: true });

  let { data, error } = await read();
  if (error) {
    // The table not existing yet is a setup state, not a fault: the page says
    // so plainly instead of showing an error nobody can act on.
    if (/relation .* does not exist/i.test(error.message)) {
      return Response.json({ steps: [], needsMigration: true });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Archived rows count as "this section exists", so this reads the table
  // unfiltered rather than reusing the list above.
  const { data: everRows } = await client.from("setup_steps").select("section");
  const seen = new Set(((everRows ?? []) as { section: string }[]).map((r) => r.section));
  const missing = seedRows().filter((row) => !seen.has(row.section));

  if (missing.length > 0) {
    const { error: seedErr } = await client.from("setup_steps").insert(missing);
    // A failed seed is not fatal: the list still renders and the next read tries
    // again. The insert is one statement, so there is no half-seeded state.
    if (!seedErr) ({ data, error } = await read());
  }

  return Response.json({ steps: ((data ?? []) as Row[]).map(view), needsMigration: false });
};

// POST — add a step to a section.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { patch, error: invalid } = validateStepPatch(body);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  if (typeof patch.label !== "string") {
    return Response.json({ error: "A step needs a name." }, { status: 400 });
  }
  const section = (body as { section?: unknown }).section;
  if (!isSetupSection(section)) {
    return Response.json({ error: "Unknown section." }, { status: 400 });
  }

  const { data, error } = await client
    .from("setup_steps")
    .insert({ ...patch, section })
    .select(SELECT)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "setup-step.create", null, {
    section,
    label: patch.label,
  });

  return Response.json({ ok: true, step: view(data as Row) }, { status: 201 });
};
