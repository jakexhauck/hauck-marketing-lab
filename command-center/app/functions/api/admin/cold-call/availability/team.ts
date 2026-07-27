import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { normalizeSlots } from "../../../../lib/coldCallAvailability";

// GET /api/admin/cold-call/availability/team?from=&to=
//
// Everyone who works the phones, and the week each of them marked. This is the
// owner's coverage view: one request rather than one per person, because the
// question being asked ("who is on Tuesday morning?") is about the whole roster
// at once and a per-person fan-out would answer it a paragraph at a time.
//
// OWNER ONLY, twice over. The role allowlist in lib/adminRoles.ts lists
// /api/admin/cold-call/availability as EXACT, so this sub-route is already shut
// to a cold caller, and the handler re-checks anyway. The duplication is
// deliberate: this is the one route that returns a colleague's hours, so it does
// not depend on a single allowlist entry staying correct forever.
//
// Who counts as "on the phones" matches the assignee list on the Assign page:
// active cold callers, plus the owner, who dials too. A setter works a client's
// leads in the Setter Suite and never appears here.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface MemberRow {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface AvailabilityRow {
  admin_id: string;
  day: string;
  slots: number[] | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(ctx.request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from) {
    return Response.json({ error: "bad_range" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: people, error: peopleError } = await client
    .from("admin_accounts")
    .select("id, name, role, status")
    .in("role", ["cold_caller", "owner"])
    .eq("status", "active")
    .order("name", { ascending: true });
  if (peopleError) {
    console.error("[cold-call/availability/team] roster failed", peopleError.message);
    return Response.json({ error: "could not load the team" }, { status: 500 });
  }

  const roster = (people ?? []) as MemberRow[];
  if (roster.length === 0) return Response.json({ members: [] });

  const { data: rows, error: rowsError } = await client
    .from("cold_call_availability")
    .select("admin_id, day, slots")
    .in(
      "admin_id",
      roster.map((m) => m.id),
    )
    .gte("day", from)
    .lte("day", to);
  if (rowsError) {
    console.error("[cold-call/availability/team] rows failed", rowsError.message);
    return Response.json({ error: "could not load availability" }, { status: 500 });
  }

  const byAdmin = new Map<string, Record<string, number[]>>();
  for (const row of (rows ?? []) as AvailabilityRow[]) {
    const days = byAdmin.get(row.admin_id) ?? {};
    days[row.day] = normalizeSlots(row.slots);
    byAdmin.set(row.admin_id, days);
  }

  // Everyone on the roster is returned, including people who have marked
  // nothing. A person missing from this list would read as "no such person"
  // when the truth is "has not filled it in", and those need different actions.
  return Response.json({
    members: roster.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      days: byAdmin.get(m.id) ?? {},
    })),
  });
};
