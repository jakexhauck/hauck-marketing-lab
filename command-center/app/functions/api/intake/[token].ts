import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { resumeView, type SubmissionRow } from "../../lib/intake";

// GET /api/intake/:token  (PUBLIC — no session)
//
// Resume a funnel. The token is 32 bytes of randomness and is the only thing
// standing between a caller and this submission, which is why nothing sensitive
// comes back: resumeView is a whitelist, and the password hash is not on it.
//
// A submitted form still resolves, so the client who bookmarks their link and
// comes back gets a thank-you rather than a dead 404. `editable` tells the
// funnel which to render.
export const onRequestGet: PagesFunction<Env, "token"> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "onboarding unavailable" }, { status: 503 });

  const token = (ctx.params.token as string) ?? "";
  if (!token) return Response.json({ error: "that link is not valid" }, { status: 404 });

  const { data } = await client
    .from("intake_submissions")
    .select(
      "id, resume_token, answers, furthest_step, status, login_email, password_hash, tenant_id",
    )
    .eq("resume_token", token)
    .maybeSingle();

  if (!data) return Response.json({ error: "that link is not valid" }, { status: 404 });

  return Response.json({ token, ...resumeView(data as SubmissionRow) });
};
