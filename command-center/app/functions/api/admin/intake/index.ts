import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { completeness } from "../../../../src/lib/intake";
import type { IntakeAnswers } from "../../../../src/lib/intake";

// GET /api/admin/intake  (admin-only, gated in _middleware.ts)
// The submissions queue: everything the funnel has produced, newest first.
// Answers are summarised rather than returned in full, so the list stays small
// and a tax ID is not shipped to the browser until Jake opens the one he wants.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const status = url.searchParams.get("status");

  let query = client
    .from("intake_submissions")
    .select("id, answers, furthest_step, status, login_email, tenant_id, submitted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as {
    id: string;
    answers: IntakeAnswers;
    furthest_step: number;
    status: string;
    login_email: string | null;
    tenant_id: string | null;
    submitted_at: string | null;
    created_at: string;
  }[];

  const submissions = rows.map((row) => {
    const answers = row.answers ?? {};
    return {
      id: row.id,
      // A submission that has not reached step 1 has no name yet. Say so rather
      // than rendering an empty row nobody can identify.
      name: typeof answers.name === "string" && answers.name.trim() ? answers.name : "Unnamed",
      niche: typeof answers.niche === "string" ? answers.niche : "",
      contactName: typeof answers.contactName === "string" ? answers.contactName : "",
      loginEmail: row.login_email,
      status: row.status,
      furthestStep: row.furthest_step,
      completeness: completeness(answers),
      tenantId: row.tenant_id,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
    };
  });

  // Counts drive the filter tabs, so they must describe every submission, not
  // just the ones that survived the current filter. Separate, unfiltered query.
  const counts: Record<string, number> = {};
  const { data: allStatuses } = await client.from("intake_submissions").select("status");
  for (const row of (allStatuses ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return Response.json({ submissions, counts, total: submissions.length });
};
