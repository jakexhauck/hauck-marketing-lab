import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { approvalBlocker, type SubmissionRow } from "../../../lib/intake";
import { approveSubmission } from "../../../lib/intakeApprove";
import { completeness } from "../../../../src/lib/intake";

// One intake submission: read it, approve it, reject it.
// Admin-only, gated in _middleware.ts.

const SELECT =
  "id, resume_token, answers, furthest_step, status, login_email, password_hash, password_plain, tenant_id, submitted_at, created_at";

async function load(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  id: string,
): Promise<SubmissionRow | null> {
  const { data } = await client
    .from("intake_submissions")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  return (data as SubmissionRow | null) ?? null;
}

// GET /api/admin/intake/:id — every answer, for the review screen.
export const onRequestGet: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const row = await load(client, ctx.params.id as string);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  // The HASH is deliberately not in this response: nothing in the admin UI
  // needs it, and the only code that reads it is approve, below.
  //
  // The PLAINTEXT is, and this is the only endpoint in the app that returns it.
  // Jake asked to be able to read back what a client typed so he can get them
  // signed in over the phone. Admin-gated in _middleware.ts, absent from the
  // list endpoint, and absent from resumeView() which is what the public funnel
  // receives. Null for every submission made before migration 0081.
  return Response.json({
    id: row.id,
    answers: row.answers ?? {},
    status: row.status,
    furthestStep: row.furthest_step,
    completeness: completeness(row.answers ?? {}),
    loginEmail: row.login_email,
    hasPassword: Boolean(row.password_hash),
    password: row.password_plain ?? null,
    tenantId: row.tenant_id,
    blocker: approvalBlocker(row),
  });
};

interface ActionBody {
  action?: "approve" | "reject";
}

// POST /api/admin/intake/:id — approve or reject.
//
// Approve is the only place in this build that creates anything. It is made
// idempotent by approvalBlocker(), which refuses a submission that already has
// a tenant, so a double-click cannot mint two clients.
export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: ActionBody = {};
  try {
    body = (await ctx.request.json()) as ActionBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const id = ctx.params.id as string;
  const row = await load(client, id);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const adminId = ctx.data.admin!.id;

  if (body.action === "reject") {
    if (row.tenant_id) {
      return Response.json(
        { error: "This submission has already created a client." },
        { status: 409 },
      );
    }
    await client
      .from("intake_submissions")
      .update({ status: "rejected", reviewed_by: adminId, reviewed_at: now, updated_at: now })
      .eq("id", id);
    await logAdminAction(client, adminId, "intake.reject", null, { submissionId: id });
    return Response.json({ ok: true, status: "rejected" });
  }

  if (body.action !== "approve") {
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  // The funnel approves itself on submit, so this button is now the RECOVERY
  // path rather than the routine one: it is what clears a submission whose
  // automatic approval failed. Same function either way, so the two can never
  // disagree about what a new client is.
  const result = await approveSubmission(client, ctx.env, row, adminId);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  await logAdminAction(client, adminId, "intake.approve", result.tenantId, {
    submissionId: id,
    slug: result.slug,
  });

  return Response.json({
    ok: true,
    status: "approved",
    tenantId: result.tenantId,
    slug: result.slug,
    ownerWarning: result.ownerWarning,
    onboardingWarning: result.onboardingWarning,
    driveWarning: result.driveWarning,
    driveFolderUrl: result.driveFolderUrl,
  });
};
