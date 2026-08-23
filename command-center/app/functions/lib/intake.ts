// Server side of the public intake funnel.
//
// Everything here exists because /api/intake/* is reachable by anyone on the
// internet. The funnel is open by design (Jake approves before anything is
// created), so this module is where the trust boundary sits: what a caller may
// write, how big it may be, which state transitions are legal, and what comes
// back down the wire.
//
// The field schema is shared with the frontend rather than restated, so a field
// added to the funnel is accepted by the API automatically and, more to the
// point, a field NOT on the funnel is rejected automatically. That is what keeps
// a caller from posting themselves a ghl_token.
//
// See docs/build-plans/client-onboarding-full.md.

import {
  INTAKE_FIELDS,
  MIN_PASSWORD_LEN,
  REVIEW_STEP,
  passwordProblems,
  type IntakeAnswers,
} from "../../src/lib/intake";

export { MIN_PASSWORD_LEN };

// Long enough for a rambling "anything else we should know", short enough that
// nobody is storing a novel in a jsonb column.
export const MAX_ANSWER_LEN = 4000;

// The whole payload, serialised. Roughly ten times a realistic submission.
export const MAX_ANSWERS_BYTES = 64_000;


export type SubmissionStatus = "in_progress" | "submitted" | "approved" | "rejected";

export interface SubmissionRow {
  id: string;
  resume_token: string;
  answers: IntakeAnswers;
  furthest_step: number;
  status: SubmissionStatus;
  login_email: string | null;
  password_hash: string | null;
  /**
   * The password as the client typed it, kept so an admin can read it back.
   *
   * Never authenticates anything: password_hash does that, here and at approve.
   * Only GET /api/admin/intake/:id returns it, and resumeView() below must
   * never carry it, because that is what the PUBLIC funnel gets back. Jake
   * reviewed the tradeoff on 2026-08-22 and kept the read-back deliberately
   * (migration 0081): getting a client signed in over the phone beats the
   * exposure of one column, in his judgement.
   */
  password_plain?: string | null;
  tenant_id: string | null;
}

// 32 bytes of randomness, base64url so it survives being a query parameter
// without escaping. Guessing one is not a realistic attack at this width.
export function mintResumeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const FIELD_BY_KEY = new Map(INTAKE_FIELDS.map((f) => [f.key, f]));

// The password never lives in the answers blob. It is pulled out here, checked,
// and handed back for the caller to hash. Only the hash is ever stored.
const PASSWORD_KEYS = new Set(["password", "passwordConfirm"]);

export interface SanitizeResult {
  answers: IntakeAnswers;
  /** Plaintext, for the caller to hash immediately. Null when absent or invalid. */
  password: string | null;
  error: string | null;
}

export function sanitizeAnswers(
  raw: unknown,
  opts: { maxBytes?: number } = {},
): SanitizeResult {
  const maxBytes = opts.maxBytes ?? MAX_ANSWERS_BYTES;
  const answers: IntakeAnswers = {};

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { answers, password: null, error: null };
  }

  const input = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(input)) {
    if (PASSWORD_KEYS.has(key)) continue; // handled below, never stored here
    const field = FIELD_BY_KEY.get(key);
    // An unknown key is not an error worth failing the whole save over. It is
    // silently dropped, which is what keeps agency-only fields off the funnel
    // no matter what a caller posts.
    if (!field) continue;

    if (field.type === "checkbox") {
      if (typeof value === "boolean") answers[key] = value;
      continue;
    }
    // Everything else is a string field. A boolean, number, array or object sent
    // for one is a malformed client, not an answer.
    if (typeof value !== "string") continue;
    answers[key] = value.slice(0, MAX_ANSWER_LEN);
  }

  if (new TextEncoder().encode(JSON.stringify(answers)).length > maxBytes) {
    return { answers: {}, password: null, error: "That is more than we can store." };
  }

  const password = typeof input.password === "string" ? input.password : "";
  const confirm = typeof input.passwordConfirm === "string" ? input.passwordConfirm : "";
  if (!password) {
    return { answers, password: null, error: null };
  }
  // The same rule the funnel states on the field. Enforced here too, because
  // the funnel's check is client-side and anyone can post straight to this
  // endpoint. Reported one rule at a time, matching what the form says.
  const problems = passwordProblems(password);
  if (problems.length > 0) {
    return { answers, password: null, error: `${problems[0]}.` };
  }
  if (confirm && password !== confirm) {
    return { answers, password: null, error: "The two passwords do not match." };
  }

  return { answers, password, error: null };
}

export function clampStep(step: unknown): number {
  const n = typeof step === "number" && Number.isFinite(step) ? Math.floor(step) : 1;
  return Math.min(Math.max(n, 1), REVIEW_STEP);
}

// A submission stops being editable the moment the client submits it. Resuming a
// finished one shows a thank-you, not the form.
export function canEdit(row: Pick<SubmissionRow, "status">): boolean {
  return row.status === "in_progress";
}

// Approve is not idempotent by nature, so it is made so here. Every reason a
// submission cannot be approved, checked before anything is created. Returns the
// reason, or null when it is safe to proceed.
export function approvalBlocker(row: SubmissionRow): string | null {
  if (row.tenant_id) return "This submission has already created a client.";
  if (row.status === "approved") return "This submission has already been approved.";
  if (row.status === "rejected") return "This submission was rejected.";
  if (row.status !== "submitted") return "The client has not finished this form yet.";
  if (!row.login_email) return "No login email was chosen.";
  if (!row.password_hash) return "No password was chosen.";
  return null;
}

// Creating a submission is the only unauthenticated write that makes a new row,
// so it is the only one worth rate limiting. Updating an existing one is already
// gated by a 32-byte token nobody can guess.
//
// In-memory, per isolate, deliberately. The existing Supabase-backed limiter
// counts login FAILURES, which is the wrong shape here, and a new table for this
// would be a lot of machinery for a form that creates nothing until Jake
// approves it. Best-effort: it stops a script hammering one PoP, and the real
// protection is that a junk submission costs exactly one row and is never seen
// by anyone but Jake.
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES_PER_WINDOW = 5;
const createLog = new Map<string, number[]>();

export function isIntakeCreateLimited(ip: string, now: number = Date.now()): boolean {
  const cutoff = now - CREATE_WINDOW_MS;
  const kept = (createLog.get(ip) ?? []).filter((t) => t > cutoff);
  createLog.set(ip, kept);
  return kept.length >= MAX_CREATES_PER_WINDOW;
}

export function recordIntakeCreate(ip: string, now: number = Date.now()): void {
  const cutoff = now - CREATE_WINDOW_MS;
  const kept = (createLog.get(ip) ?? []).filter((t) => t > cutoff);
  kept.push(now);
  createLog.set(ip, kept);
}

/** Test seam. Never called in production. */
export function resetIntakeRateLimit(): void {
  createLog.clear();
}

export interface ResumeView {
  answers: IntakeAnswers;
  furthestStep: number;
  status: SubmissionStatus;
  editable: boolean;
  /** So the funnel can show "already set, leave blank to keep" rather than a bare box. */
  hasPassword: boolean;
  loginEmail: string | null;
}

// What a resumed funnel is allowed to see. The hash never leaves the server, so
// this is a whitelist rather than a delete-these-keys.
export function resumeView(row: SubmissionRow): ResumeView {
  return {
    answers: row.answers ?? {},
    furthestStep: row.furthest_step,
    status: row.status,
    editable: canEdit(row),
    hasPassword: Boolean(row.password_hash),
    loginEmail: row.login_email,
  };
}
