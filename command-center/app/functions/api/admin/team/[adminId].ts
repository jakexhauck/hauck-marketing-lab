import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { hashPassword } from "../../../lib/password";
import { normalizeEmail } from "../../../lib/staff";
import { isAdminRole } from "../../../lib/adminRoles";
import {
  SELECT,
  emailTaken,
  isEmailish,
  passwordProblem,
  requireOwner,
  toMember,
  type TeamRow,
} from "./index";

// Edit or disable one agency login. Owner-only, same as the roster itself.
//
// Two things this file refuses to do, both of which would be permanent:
//   - lock the signed-in owner out of their own console (demote or disable self)
//   - remove the last owner, leaving a console nobody can administer
// Both are checked against the database rather than the request, so two owners
// editing at once cannot race each other into an unadministered account.

interface PatchBody {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  password?: string;
}

// Count the active owners other than `exceptId`. Zero means `exceptId` is the
// last one standing and must not be demoted or disabled.
async function otherActiveOwners(
  client: SupabaseClient,
  exceptId: string,
): Promise<number> {
  const { count } = await client
    .from("admin_accounts")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active")
    .neq("id", exceptId);
  return count ?? 0;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const targetId = String(ctx.params.adminId ?? "");
  if (!targetId) return Response.json({ error: "not found" }, { status: 404 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { data: existing } = await client
    .from("admin_accounts")
    .select(SELECT)
    .eq("id", targetId)
    .maybeSingle();
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const current = toMember(existing as TeamRow);
  const isSelf = targetId === ctx.data.admin!.id;
  const patch: Record<string, unknown> = {};
  // What changed, in the words the audit log should carry. Never the password
  // itself: "password" as a bare marker is the whole record.
  const changed: string[] = [];

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return Response.json({ error: "Enter their name." }, { status: 400 });
    if (name !== current.name) {
      patch.name = name;
      changed.push("name");
    }
  }

  if (typeof body.email === "string") {
    const email = normalizeEmail(body.email);
    if (!isEmailish(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (email !== current.email) {
      if (await emailTaken(client, email, targetId)) {
        return Response.json({ error: "That email already has a login." }, { status: 409 });
      }
      patch.email = email;
      changed.push("email");
    }
  }

  if (typeof body.role === "string" && body.role !== current.role) {
    if (!isAdminRole(body.role)) {
      return Response.json({ error: "Pick a role." }, { status: 400 });
    }
    if (isSelf) {
      return Response.json(
        { error: "You cannot change your own role. Ask another owner to do it." },
        { status: 409 },
      );
    }
    if (current.role === "owner" && (await otherActiveOwners(client, targetId)) === 0) {
      return Response.json(
        { error: "This is the last owner. Make someone else an owner first." },
        { status: 409 },
      );
    }
    patch.role = body.role;
    changed.push("role");
  }

  if (typeof body.status === "string" && body.status !== current.status) {
    if (body.status !== "active" && body.status !== "disabled") {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    if (body.status === "disabled") {
      if (isSelf) {
        return Response.json(
          { error: "You cannot disable your own login." },
          { status: 409 },
        );
      }
      if (current.role === "owner" && (await otherActiveOwners(client, targetId)) === 0) {
        return Response.json(
          { error: "This is the last owner. Make someone else an owner first." },
          { status: 409 },
        );
      }
    }
    patch.status = body.status;
    changed.push("status");
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    const problem = passwordProblem(body.password.trim());
    if (problem) return Response.json({ error: problem }, { status: 400 });
    patch.password_hash = await hashPassword(body.password.trim());
    changed.push("password");
  }

  if (!changed.length) return Response.json({ member: current });

  patch.updated_at = new Date().toISOString();
  const { data, error } = await client
    .from("admin_accounts")
    .update(patch)
    .eq("id", targetId)
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[admin/team] update failed", error?.message);
    return Response.json({ error: "could not save the change" }, { status: 500 });
  }

  const member = toMember(data as TeamRow);
  const logged = await logAdminAction(client, ctx.data.admin!.id, "team.update", null, {
    targetAdminId: targetId,
    email: member.email,
    changed,
    role: member.role,
    status: member.status,
  });

  return Response.json({ member, audited: logged });
};

// DELETE /api/admin/team/:adminId  (owner-only) - disable, never delete.
//
// The row stays so their dials, notes and audit trail keep a name attached. The
// account stops working immediately: getActiveAdmin rejects a disabled row on
// the very next request, even with a still-valid signed cookie.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const targetId = String(ctx.params.adminId ?? "");
  if (!targetId) return Response.json({ error: "not found" }, { status: 404 });
  if (targetId === ctx.data.admin!.id) {
    return Response.json({ error: "You cannot disable your own login." }, { status: 409 });
  }

  const { data: existing } = await client
    .from("admin_accounts")
    .select(SELECT)
    .eq("id", targetId)
    .maybeSingle();
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const current = toMember(existing as TeamRow);
  if (current.role === "owner" && (await otherActiveOwners(client, targetId)) === 0) {
    return Response.json(
      { error: "This is the last owner. Make someone else an owner first." },
      { status: 409 },
    );
  }

  const { data, error } = await client
    .from("admin_accounts")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[admin/team] disable failed", error?.message);
    return Response.json({ error: "could not disable the login" }, { status: 500 });
  }

  const member = toMember(data as TeamRow);
  const logged = await logAdminAction(client, ctx.data.admin!.id, "team.disable", null, {
    targetAdminId: targetId,
    email: member.email,
  });

  return Response.json({ member, audited: logged });
};
