import type { Env, ApiData } from "../../../../../lib/env";
import { isAgencyGhlConfigured } from "../../../../../lib/agencyGhl";
import { ringAndBridge } from "../../../../../lib/bridgeDial";
import { bridgeWorkflowName } from "../../../../../lib/coldCallBridge";

// POST /api/admin/cold-sms/prospect/:contactId/call  (owner only)
//
// The panel's Call button (Jake, 2026-10-13): GHL rings Jake's phone, and when he
// answers it dials the prospect from the agency number. Same workflow as the
// Cold Call card (lib/bridgeDial.ts). The prospect is already a GHL contact, so
// nothing is upserted first. Never retried: a second enrolment is a second call.

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ ok: false, message: "GoHighLevel is not connected." });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  const workflow = bridgeWorkflowName(ctx.env);
  const rung = await ringAndBridge(ctx.env, contactId);
  if (rung.ok) return Response.json({ ok: true });

  if (rung.detail) console.error("[cold-sms/call]", rung.detail);
  const message =
    rung.error === "workflow_missing"
      ? `No "${workflow}" workflow in GoHighLevel`
      : rung.error === "workflow_draft"
        ? `"${workflow}" is a draft in GoHighLevel. Publish it.`
        : "GoHighLevel did not place the call";
  return Response.json({ ok: false, message });
};
