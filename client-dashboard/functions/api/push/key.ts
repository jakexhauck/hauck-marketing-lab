import type { Env, ApiData } from "../../lib/env";

// Hand the client the VAPID public key at runtime so a key rotation does not
// require a frontend rebuild. The public key is not secret, but this route is
// kept authed (not in _middleware PUBLIC_PATHS) for simplicity: only signed-in
// devices ever need it.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const publicKey = ctx.env.VAPID_PUBLIC_KEY ?? "";
  if (!publicKey) {
    return Response.json({ error: "push_not_configured" }, { status: 503 });
  }
  return Response.json({ publicKey });
};
