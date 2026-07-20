import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// POST /api/admin/setter/dials (admin-only, gated in _middleware.ts). Appends
// one row to setter_dials for a phone call a setter just made. Every derived
// per-lead stat and headline rate (functions/lib/setterMetrics.ts) is built
// from these rows, never stored redundantly, so this is the single write
// path for the whole Setter Suite's history. See migration 0040 for the
// column set and the DB-level check constraint on outcome.

export const OUTCOMES = ["booked", "not_interested", "no_answer", "reschedule", "bad_lead"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface DialBody {
  tenantId?: string;
  contactId?: string;
  opportunityId?: string | null;
  pipelineName?: string | null;
  stageName?: string | null;
  spoke?: boolean;
  outcome?: string;
  note?: string | null;
  tagsApplied?: string[];
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

// Pure, split out so it is unit-testable without a request. Every field the
// DB also constrains (the outcome enum) is checked here too, so a bad
// request 400s instead of surfacing the DB's check-constraint violation as a
// 500.
export function validateDialBody(body: DialBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
  }
  if (!body.contactId || !body.contactId.trim()) {
    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
  }
  if (!body.outcome || !OUTCOMES.includes(body.outcome as Outcome)) {
    return { ok: false, code: "bad_outcome", error: "outcome must be one of: " + OUTCOMES.join(", ") };
  }
  // The one input that silently corrupts the Contact rate metric: no_answer
  // means nobody picked up, so it can never be paired with spoke: true. Must
  // be a hard validation error, not a row that quietly overstates contacts.
  if (body.outcome === "no_answer" && body.spoke === true) {
    return {
      ok: false,
      code: "contradictory",
      error: "outcome 'no_answer' cannot be paired with spoke: true",
    };
  }
  return { ok: true };
}

// The shape returned to the client, camelCased, shared with the lead detail
// endpoint's `dials` array (functions/api/admin/setter/lead/[contactId].ts).
export interface ApiDialRow {
  id: string;
  contactId: string;
  opportunityId: string | null;
  pipelineName: string | null;
  stageName: string | null;
  dialedAt: string;
  spoke: boolean;
  outcome: string;
  note: string | null;
  tagsApplied: string[];
  createdBy: string | null;
  createdAt: string;
}

// The raw setter_dials row shape as it comes back from Supabase (0040).
export interface RawDialRow {
  id: string;
  contact_id: string;
  opportunity_id: string | null;
  pipeline_name: string | null;
  stage_name: string | null;
  dialed_at: string;
  spoke: boolean;
  outcome: string;
  note: string | null;
  tags_applied: string[] | null;
  created_by: string | null;
  created_at: string;
}

export const DIAL_SELECT =
  "id, contact_id, opportunity_id, pipeline_name, stage_name, dialed_at, spoke, outcome, note, tags_applied, created_by, created_at";

export function shapeDialRow(row: RawDialRow): ApiDialRow {
  return {
    id: row.id,
    contactId: row.contact_id,
    opportunityId: row.opportunity_id,
    pipelineName: row.pipeline_name,
    stageName: row.stage_name,
    dialedAt: row.dialed_at,
    spoke: row.spoke,
    outcome: row.outcome,
    note: row.note,
    tagsApplied: row.tags_applied ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<DialBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateDialBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  const { data, error } = await client
    .from("setter_dials")
    .insert({
      tenant_id: body.tenantId,
      contact_id: body.contactId,
      opportunity_id: body.opportunityId ?? null,
      pipeline_name: body.pipelineName ?? null,
      stage_name: body.stageName ?? null,
      spoke: body.spoke === true,
      outcome: body.outcome,
      note: body.note && body.note.trim() ? body.note.trim() : null,
      tags_applied: body.tagsApplied ?? [],
      created_by: adminId,
    })
    .select(DIAL_SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save dial" }, { status: 500 });
  }

  const dial = shapeDialRow(data as unknown as RawDialRow);
  await logAdminAction(client, adminId, "setter.dial", body.tenantId!, {
    contactId: body.contactId,
    outcome: body.outcome,
    spoke: dial.spoke,
  });

  return Response.json({ dial }, { status: 201 });
};
