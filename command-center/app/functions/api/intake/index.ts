import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { hashPassword } from "../../lib/password";
import { normalizeEmail } from "../../lib/staff";
import { clientIp } from "../../lib/ratelimit";
import {
  canEdit,
  clampStep,
  isIntakeCreateLimited,
  mintResumeToken,
  recordIntakeCreate,
  resumeView,
  sanitizeAnswers,
  type SubmissionRow,
} from "../../lib/intake";
import { REVIEW_STEP } from "../../../src/lib/intake";

// POST /api/intake  (PUBLIC — no session, reachable by anyone)
//
// Creates or updates one intake submission. Called on every step advance, so
// the client never loses work. Without a token this mints a new submission and
// returns its resume token; with one it updates that submission and nothing
// else.
//
// Nothing here creates a tenant, a login, or anything else. A submission is
// inert until Jake approves it in the admin queue. That is the whole reason
// this endpoint can safely be public.

interface Body {
  token?: string;
  answers?: unknown;
  step?: number;
  /** True on the final step: locks the submission and puts it in Jake's queue. */
  submit?: boolean;
}

const SELECT =
  "id, resume_token, answers, furthest_step, status, login_email, password_hash, tenant_id";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "onboarding unavailable" }, { status: 503 });

  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const clean = sanitizeAnswers(body.answers);
  if (clean.error) return Response.json({ error: clean.error }, { status: 400 });

  const step = clampStep(body.step);
  const token = typeof body.token === "string" ? body.token.trim() : "";

  // The login email is stored in its own column as well as the answers blob, so
  // the queue can show it and so a clash is caught here rather than at approve.
  const loginEmail = normalizeEmail(
    typeof clean.answers.loginEmail === "string" ? clean.answers.loginEmail : "",
  );
  if (loginEmail) {
    const clash = await emailTaken(client, loginEmail, token);
    if (clash) {
      return Response.json(
        { error: "That email is already in use. Please choose another." },
        { status: 409 },
      );
    }
  }

  const passwordHash = clean.password ? await hashPassword(clean.password) : null;

  if (!token) {
    const ip = clientIp(ctx.request);
    if (isIntakeCreateLimited(ip)) {
      return Response.json({ error: "too many attempts, try again later" }, { status: 429 });
    }
    recordIntakeCreate(ip);

    const resumeToken = mintResumeToken();
    const { data, error } = await client
      .from("intake_submissions")
      .insert({
        resume_token: resumeToken,
        answers: clean.answers,
        furthest_step: step,
        status: body.submit ? "submitted" : "in_progress",
        login_email: loginEmail || null,
        password_hash: passwordHash,
        submitted_at: body.submit ? new Date().toISOString() : null,
      })
      .select(SELECT)
      .single();
    if (error || !data) {
      return Response.json({ error: "could not save your answers" }, { status: 500 });
    }
    return Response.json({ token: resumeToken, ...resumeView(data as SubmissionRow) });
  }

  const { data: existing } = await client
    .from("intake_submissions")
    .select(SELECT)
    .eq("resume_token", token)
    .maybeSingle();
  const row = existing as SubmissionRow | null;
  if (!row) return Response.json({ error: "that link is not valid" }, { status: 404 });

  // Submitted is final. Reopening one would let a client edit answers Jake has
  // already read, or worse, change their password after approval.
  if (!canEdit(row)) {
    return Response.json({ error: "this form has already been submitted" }, { status: 409 });
  }

  const update: Record<string, unknown> = {
    // Merged, not replaced: a step save posts only what that step knows about.
    answers: { ...(row.answers ?? {}), ...clean.answers },
    furthest_step: Math.max(row.furthest_step, step),
    updated_at: new Date().toISOString(),
  };
  if (loginEmail) update.login_email = loginEmail;
  // A resumed funnel sends no password, and that must not wipe the stored hash.
  if (passwordHash) update.password_hash = passwordHash;
  if (body.submit) {
    update.status = "submitted";
    update.furthest_step = REVIEW_STEP;
    update.submitted_at = new Date().toISOString();
  }

  const { data: saved, error } = await client
    .from("intake_submissions")
    .update(update)
    .eq("resume_token", token)
    .select(SELECT)
    .single();
  if (error || !saved) {
    return Response.json({ error: "could not save your answers" }, { status: 500 });
  }

  return Response.json({ token, ...resumeView(saved as SubmissionRow) });
};

// An email is taken if a real login already uses it, or if another live
// submission has claimed it. A rejected submission releases its claim.
//
// This check is an account-enumeration oracle, and a knowing one: it answers
// "does this email have an account here". It earns its place because the
// alternative, accepting a duplicate and failing days later at approve, puts
// the pain on Jake and the client instead. See the Risks section of
// docs/build-plans/client-onboarding-full.md.
const LIVE_CLAIMS = new Set(["in_progress", "submitted", "approved"]);

async function emailTaken(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  email: string,
  ownToken: string,
): Promise<boolean> {
  const { data: staff } = await client
    .from("staff_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (staff) return true;

  const { data: others } = await client
    .from("intake_submissions")
    .select("resume_token, status")
    .eq("login_email", email);

  return (others ?? []).some(
    (o: { resume_token: string; status: string }) =>
      o.resume_token !== ownToken && LIVE_CLAIMS.has(o.status),
  );
}
