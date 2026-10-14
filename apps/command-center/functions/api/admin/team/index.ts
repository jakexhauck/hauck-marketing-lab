import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { hashPassword } from "../../../lib/password";
import { normalizeEmail } from "../../../lib/staff";
import {
  isAdminRole,
  normalizeUsername,
  usernameProblem,
  type AdminRole,
} from "../../../lib/adminRoles";

// The agency's own logins (0008 + roles from 0047). This is the Team page:
// who can sign into this console and what their role lets them reach.
//
// Owner-only, twice over. The role gate in _middleware never lists
// /api/admin/team for a non-owner role, and every handler here re-checks. The
// duplication is deliberate: this endpoint mints credentials, so it does not
// rely on a single allowlist entry staying correct forever.

export interface TeamRow {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

export const SELECT =
  "id, name, username, email, role, status, created_at, last_login_at";

export function toMember(row: TeamRow) {
  return {
    id: row.id,
    name: row.name,
    // The login handle since 0051. Rows written before it were backfilled.
    username: row.username ?? "",
    email: row.email ?? "",
    role: isAdminRole(row.role) ? row.role : "cold_caller",
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

// Guard shared by both files here. Returns a 403 Response when the caller is not
// an owner, or null when they may proceed.
export function requireOwner(ctx: { data: ApiData }): Response | null {
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

// Password floor. These credentials open the agency's console, and they are
// typed by Jake and handed over rather than chosen by the person using them, so
// the rule is length: 12 characters, no composition theatre.
export const MIN_PASSWORD = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

// Deliberately loose: enough to catch a typo like a missing @, not a spec-
// perfect RFC matcher that rejects real addresses.
export function isEmailish(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function emailTaken(
  client: SupabaseClient,
  email: string,
  exceptId?: string,
): Promise<boolean> {
  let query = client.from("admin_accounts").select("id").eq("email", email);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function usernameTaken(
  client: SupabaseClient,
  username: string,
  exceptId?: string,
): Promise<boolean> {
  let query = client.from("admin_accounts").select("id").eq("username", username);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

// GET /api/admin/team  (owner-only) - the roster, oldest account first so Jake
// stays at the top and new hires append below him.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("admin_accounts")
    .select(SELECT)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/team] list failed", error.message);
    return Response.json({ error: "could not load the team" }, { status: 500 });
  }

  return Response.json({ team: ((data ?? []) as TeamRow[]).map(toMember) });
};

interface CreateBody {
  name?: string;
  username?: string;
  // Optional since 0051: an agency login needs a username, not a mailbox.
  email?: string;
  password?: string;
  role?: string;
}

// POST /api/admin/team  (owner-only) - create a login.
//
// The password is set here and handed over in person: there is no invite email
// and no reset link, because one hire does not justify that machinery. The
// plaintext is never stored and never returned; the caller already has it.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const username = normalizeUsername(body.username ?? "");
  const email = normalizeEmail(body.email ?? "");
  const password = (body.password ?? "").trim();
  const role = body.role;

  if (!name) return Response.json({ error: "Enter their name." }, { status: 400 });
  const userProblem = usernameProblem(username);
  if (userProblem) return Response.json({ error: userProblem }, { status: 400 });
  // Email is optional now. Supplied, it still has to look like one.
  if (email && !isEmailish(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const pwProblem = passwordProblem(password);
  if (pwProblem) return Response.json({ error: pwProblem }, { status: 400 });
  if (!isAdminRole(role)) {
    return Response.json({ error: "Pick a role." }, { status: 400 });
  }

  if (await usernameTaken(client, username)) {
    return Response.json({ error: "That username is taken." }, { status: 409 });
  }
  if (email && (await emailTaken(client, email))) {
    return Response.json({ error: "That email already has a login." }, { status: 409 });
  }

  const { data, error } = await client
    .from("admin_accounts")
    .insert({
      name,
      username,
      email: email || null,
      role: role as AdminRole,
      password_hash: await hashPassword(password),
      status: "active",
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[admin/team] create failed", error?.message);
    return Response.json({ error: "could not create the login" }, { status: 500 });
  }

  const member = toMember(data as TeamRow);
  // Creating a login is the most consequential action on this page. Record it
  // before answering, and tell the caller if the record did not land.
  const logged = await logAdminAction(client, ctx.data.admin!.id, "team.create", null, {
    createdAdminId: member.id,
    username: member.username,
    role: member.role,
  });

  return Response.json({ member, audited: logged }, { status: 201 });
};
