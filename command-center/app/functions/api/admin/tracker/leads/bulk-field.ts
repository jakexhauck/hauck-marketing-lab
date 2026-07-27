import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// PATCH /api/admin/tracker/leads/bulk-field  (owner-only)
//
// Set one field on a selection of prospects at once.
//
// This exists because of how lists actually arrive. Two hundred rows bought as
// "Detroit roofers" are two hundred rows with the same niche and the same
// state, and typing that two hundred times is not data entry, it is a reason
// nobody categorises the book at all. One control, one value, one statement.
//
// Deliberately ONE field per request rather than a patch object. A bulk write is
// the easy way to quietly overwrite something nobody meant to touch, so the
// request has to name the single column it is here to change, and the response
// says how many rows it actually reached.
//
// The allowlist below is the whole authority. Only descriptive columns are on
// it: nothing here can set a status, a date, an attempt count or an assignee.
// Those either belong to the app (status, dates) or already have their own
// endpoint with its own checks (assign).

const MAX_IDS = 5000;

// camelCase from the browser, snake_case in the table. A key that is not here is
// refused outright rather than ignored, so a typo fails loudly instead of
// reporting success on a write that never happened.
const FIELDS: Record<string, string> = {
  businessName: "business_name",
  niche: "niche",
  website: "website",
  city: "city",
  state: "state",
  source: "source",
};

// Long enough for a real company name, short enough that this cannot be used to
// paste an essay onto five thousand rows.
const MAX_VALUE = 200;

interface Body {
  ids?: unknown;
  field?: unknown;
  value?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Select at least one lead." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return Response.json({ error: "Too many leads at once." }, { status: 400 });
  }

  const field = typeof body.field === "string" ? body.field : "";
  const column = FIELDS[field];
  if (!column) {
    return Response.json({ error: "That field cannot be set in bulk." }, { status: 400 });
  }

  if (typeof body.value !== "string") {
    return Response.json({ error: "invalid value" }, { status: 400 });
  }
  const value = body.value.trim().slice(0, MAX_VALUE);
  // An empty value is allowed and means "clear it": correcting a bulk set that
  // went on the wrong rows has to be as easy as making it, or nobody will risk
  // using this at all.

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("leads")
    .update({ [column]: value, updated_at: new Date().toISOString() })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[leads/bulk-field] update failed", error.message);
    return Response.json({ error: "Could not update those leads." }, { status: 500 });
  }

  const updated = (data ?? []).length;
  await logAdminAction(client, admin.id, "leads.bulk_field", null, {
    field,
    value,
    count: updated,
  });

  return Response.json({ updated });
};
