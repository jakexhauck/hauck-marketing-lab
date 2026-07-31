import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { approvalBlocker, type SubmissionRow } from "./intake";
import { CreateTenantError, createTenantWithOwner, seedOnboardingRecord } from "./clientCreate";
import { provisionClientFolder } from "./clientDriveFolder";
import { CHECKLIST_TASKS } from "../../src/lib/onboarding";

// Turning a finished submission into a client.
//
// This used to live inside the admin endpoint, because approving was something
// Jake did. It is now ALSO what the public funnel does to itself the moment a
// client presses "Send it in", so it lives here and both callers share it. Two
// copies of this would be two definitions of what a new client is, and they
// would drift the first time one of them gained a step.
//
// `actorId` is the admin who pressed the button, or NULL when the funnel
// approved itself. Null is written to reviewed_by, which is nullable and has no
// foreign key precisely so "nobody, it was automatic" is expressible. The audit
// log is skipped in that case rather than attributed to a made-up admin:
// admin_audit_log.admin_id is NOT NULL and references a real account, and
// inventing one there would put a lie in the record of who did what.
//
// Everything after the tenant exists is BEST EFFORT and reported rather than
// thrown. By then the client is real and can sign in; failing the whole call
// would leave a tenant with no way to tell anyone it is there.

export type ApproveResult =
  | {
      ok: true;
      tenantId: string;
      slug: string;
      ownerWarning?: string;
      onboardingWarning?: string;
      driveWarning?: string;
      driveFolderUrl?: string;
    }
  | { ok: false; status: number; error: string };

export async function approveSubmission(
  client: SupabaseClient,
  env: Env,
  row: SubmissionRow,
  actorId: string | null,
): Promise<ApproveResult> {
  const blocker = approvalBlocker(row);
  if (blocker) return { ok: false, status: 409, error: blocker };

  const answers = row.answers ?? {};
  const text = (key: string): string | undefined => {
    const raw = answers[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  };
  const businessName = text("name") ?? "Unnamed client";

  // Re-check the email at the last possible moment. It was checked at funnel
  // step 3, and on the admin path days may have passed since. Checked before
  // anything is created, so a clash costs nothing.
  const { data: clash } = await client
    .from("staff_accounts")
    .select("id")
    .eq("email", row.login_email as string)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      status: 409,
      error: `${row.login_email} is already in use by another login.`,
    };
  }

  let created;
  try {
    created = await createTenantWithOwner(client, {
      name: businessName,
      niche: text("niche"),
      ownerEmail: row.login_email as string,
      ownerName: text("contactName"),
      ownerPasswordHash: row.password_hash as string,
      // The client stays behind the holding screen until Go Live is pressed.
      // This is what makes self-approval safe: finishing the form gets you an
      // account that can sign in and see that it is being built, nothing more.
      onboardingStatus: "setup",
    });
  } catch (e) {
    if (!(e instanceof CreateTenantError)) throw e;
    return { ok: false, status: 500, error: e.message };
  }

  // Hand the answers to the setup record, and seed its checklist. The answers go
  // to `intake` and NOT to `fields`: fields is the map of values pushed into the
  // client's GHL sub-account, so putting raw funnel answers there would offer to
  // write `whySignedUp` into GoHighLevel.
  const onboardingWarning = await seedOnboardingRecord(
    client,
    created.tenantId,
    answers,
    CHECKLIST_TASKS.map((task) => task.key),
  );

  // Their Drive folder. Never fatal: the client exists by now, and a folder can
  // simply be made again.
  const drive = await provisionClientFolder(
    env,
    client,
    created.tenantId,
    businessName,
    actorId,
  );

  const now = new Date().toISOString();
  await client
    .from("intake_submissions")
    .update({
      status: "approved",
      tenant_id: created.tenantId,
      reviewed_by: actorId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  return {
    ok: true,
    tenantId: created.tenantId,
    slug: created.slug,
    ownerWarning: created.ownerWarning,
    onboardingWarning,
    driveWarning: drive.warning ?? undefined,
    driveFolderUrl: drive.folder?.webViewLink ?? undefined,
  };
}
