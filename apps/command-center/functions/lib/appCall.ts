import { ghlJson, type GhlContext } from "./ghl";
import { readableError } from "./agencyCrm";
import { ghlEventStartTime, pickBridgeWorkflow, type GhlWorkflowSummary } from "./coldCallBridge";

// Jake setting appointments for a client (Client > Setting, 2026-10-21). Call
// drops the lead into the client sub-account's "App Call" workflow, which rings
// Jake and bridges the lead from the client's GHL number. Jake owns that
// workflow and who it rings (the assigned user), so the app only enrols.

// The snapshot split it in two (2026-10-24): "Dialer App Call" rings the
// dialer, "Client App Call" rings the owner. Clients loaded earlier still have
// the one "App Call", so it stays as the fallback. Client App Call is never a
// match: it would ring the owner instead of Jake.
export const APP_CALL_WORKFLOW = "Dialer App Call";
const APP_CALL_FALLBACK = "App Call";

// Names compared on letters and digits only. The snapshot puts an emoji in
// front ("💻 App Call", AAG 2026-10-22), which an exact match missed.
export function workflowKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type AppCallResult = { ok: true } | { ok: false; message: string };

export async function startAppCall(gctx: GhlContext, contactId: string): Promise<AppCallResult> {
  let workflows: GhlWorkflowSummary[];
  try {
    const res = await ghlJson<{ workflows?: GhlWorkflowSummary[] }>(
      gctx,
      `/workflows/?locationId=${encodeURIComponent(gctx.locationId)}`,
    );
    workflows = res.workflows ?? [];
  } catch (err) {
    return { ok: false, message: `Could not read the workflows: ${readableError(err)}` };
  }

  const keyed = workflows.map((w) => ({ ...w, name: workflowKey(w.name ?? "") }));
  let pick = pickBridgeWorkflow(keyed, workflowKey(APP_CALL_WORKFLOW));
  if (!pick.ok && pick.error === "workflow_missing") {
    pick = pickBridgeWorkflow(keyed, workflowKey(APP_CALL_FALLBACK));
  }
  if (!pick.ok) {
    return {
      ok: false,
      message:
        pick.error === "workflow_draft"
          ? `"${APP_CALL_WORKFLOW}" is in draft in this sub-account. Publish it.`
          : `No "${APP_CALL_WORKFLOW}" workflow in this sub-account.`,
    };
  }

  try {
    await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(pick.id)}`, {
      method: "POST",
      body: JSON.stringify({ eventStartTime: ghlEventStartTime(new Date()) }),
    });
  } catch (err) {
    return { ok: false, message: `Could not start the call: ${readableError(err)}` };
  }
  return { ok: true };
}
