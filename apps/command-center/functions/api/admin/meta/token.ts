import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import type { MetaTokenState } from "../../../../src/lib/secretsApi";
import {
  maskToken,
  metaTokenSource,
  resolveMetaToken,
  saveMetaToken,
  verifyMetaToken,
} from "../../../lib/metaToken";

// /api/admin/meta/token  (admin-only, gated upstream in _middleware.ts)
//
// The one box in the Paid Ads wizard. Paste, press Connect, it is live.
//
//   GET   is a token set, where does it live, what is its tail
//   POST  prove a pasted token against Meta, then store it
//
// The proving matters more than the storing. A token is just a string until
// something answers with it, and a saved-but-dead token turns "connected" into
// a lie that only surfaces days later as a dashboard full of zeroes. So the
// token is used before it is trusted, and a rejection comes back in Meta's own
// words with nothing written.
//
// Never returns the value. A saved token leaves here as a masked tail only.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = await resolveMetaToken(ctx.env);
  return Response.json({
    configured: Boolean(token),
    source: await metaTokenSource(ctx.env),
    masked: maskToken(token),
  } satisfies MetaTokenState);
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: { token?: unknown } = {};
  try {
    body = (await ctx.request.json()) as { token?: unknown };
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return Response.json({ error: "Paste a token first." }, { status: 400 });
  // Pasting from Meta's own UI sometimes brings the label along. Refuse rather
  // than store something that will fail on the first call.
  if (/\s/.test(token)) {
    return Response.json({ error: "That has spaces in it. Copy just the token." }, { status: 400 });
  }

  const check = await verifyMetaToken(token);
  if (!check.ok) {
    return Response.json({ error: `Meta rejected that token: ${check.error}` }, { status: 400 });
  }

  const saved = await saveMetaToken(ctx.env, token, ctx.data.admin?.id ?? null);
  if (!saved.ok) {
    return Response.json({ error: saved.error ?? "Could not save it." }, { status: 500 });
  }

  const client = getServiceClient(ctx.env);
  if (client && ctx.data.admin) {
    // The value is never logged. That it changed, and who changed it, is.
    await logAdminAction(client, ctx.data.admin.id, "meta.token.save", null, {
      accounts: check.accounts,
    });
  }

  return Response.json({
    ok: true,
    /** How many ad accounts this token can see, which is the next thing that matters. */
    accounts: check.accounts,
    masked: maskToken(token),
  });
};
