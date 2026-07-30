import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { approvalBlocker, type SubmissionRow } from "../../../lib/intake";
import {
  CreateTenantError,
  createTenantWithOwner,
  seedOnboardingRecord,
} from "../../../lib/clientCreate";
import { provisionClientFolder } from "../../../lib/clientDriveFolder";
import { CHECKLIST_TASKS } from "../../../../src/lib/onboarding";
import { completeness } from "../../../../src/lib/intake";

// One intake submission: read it, approve it, reject it.
// Admin-only, gated in _middleware.ts.

const SELECT =
  "id, resume_token, answers, furthest_step, status, login_email, password_hash, tenant_id, submitted_at, created_at";

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

  // The password hash is deliberately not in this response. Nothing in the
  // admin UI needs it, and the only code that reads it is approve, below.
  return Response.json({
    id: row.id,
    answers: row.answers ?? {},
    status: row.status,
    furthestStep: row.furthest_step,
    completeness: completeness(row.answers ?? {}),
    loginEmail: row.login_email,
    hasPassword: Boolean(row.password_hash),
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

  const blocker = approvalBlocker(row);
  if (blocker) return Response.json({ error: blocker }, { status: 409 });

  const answers = row.answers ?? {};
  const text = (key: string): string | undefined => {
    const raw = answers[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  };

  // Re-check the email at the last possible moment. It was checked at funnel
  // step 3, but days may have passed and a staff account could have taken it
  // since. Checked before anything is created, so a clash costs nothing.
  const { data: clash } = await client
    .from("staff_accounts")
    .select("id")
    .eq("email", row.login_email as string)
    .maybeSingle();
  if (clash) {
    return Response.json(
      { error: `${row.login_email} is already in use by another login.` },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await createTenantWithOwner(client, {
      name: text("name") ?? "Unnamed client",
      niche: text("niche"),
      ownerEmail: row.login_email as string,
      ownerName: text("contactName"),
      ownerPasswordHash: row.password_hash as string,
      // The client stays behind the holding screen until Jake presses Go Live.
      onboardingStatus: "setup",
    });
  } catch (e) {
    if (!(e instanceof CreateTenantError)) throw e;
    return Response.json({ error: e.message }, { status: 500 });
  }

  // Hand the answers to the setup record, and seed its checklist. The answers go
  // to `intake` and NOT to `fields`: fields is the map of values pushed into the
  // client's GHL sub-account, so putting raw funnel answers there would offer to
  // write `whySignedUp` into GoHighLevel. seedOnboardingRecord copies across the
  // handful that are genuinely the same fact under two names.
  const onboardingWarning = await seedOnboardingRecord(
    client,
    created.tenantId,
    answers,
    CHECKLIST_TASKS.map((task) => task.key),
  );

  // Their Drive folder, same as the manual path. Never fatal: the client exists
  // by now, and a folder can simply be made again.
  const drive = await provisionClientFolder(
    ctx.env,
    client,
    created.tenantId,
    text("name") ?? "Unnamed client",
    adminId,
  );

  await client
    .from("intake_submissions")
    .update({
      status: "approved",
      tenant_id: created.tenantId,
      reviewed_by: adminId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  await logAdminAction(client, adminId, "intake.approve", created.tenantId, {
    submissionId: id,
    slug: created.slug,
  });

  return Response.json({
    ok: true,
    status: "approved",
    tenantId: created.tenantId,
    slug: created.slug,
    ownerWarning: created.ownerWarning,
    onboardingWarning,
    driveWarning: drive.warning ?? undefined,
    driveFolderUrl: drive.folder?.webViewLink ?? undefined,
  });
};
