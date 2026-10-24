import { ghlJson, type GhlContext } from "./ghl";
import { readableError } from "./agencyCrm";
import { ghlEventStartTime, pickBridgeWorkflow, type GhlWorkflowSummary } from "./coldCallBridge";
import { CALL_NOW_TAG } from "./callNow";
import { fireCallTag } from "./callNowHandler";

// Jake setting appointments for a client (Client > Setting, 2026-10-21). Call
// rings Jake and bridges the lead from the client's GHL number. Jake owns the
// GHL side and who it rings (the assigned user), so the app only starts it.

// The snapshot split it in two (2026-10-24): "Dialer App Call" rings the
// dialer, "Client App Call" rings the owner. Clients loaded earlier still have
// the one "App Call", so it stays as the fallback. Client App Call is never a
// match: it would ring the owner instead of Jake.
export const APP_CALL_WORKFLOW = "Dialer App Call";
const APP_CALL_FALLBACK = "App Call";

// Later the same day the snapshot folded every call into one "Tracking"
// workflow, a branch per Tag Added trigger. No call workflow to enrol in there,
// so the app adds the branch's tag instead.
export const TRACKING_WORKFLOW = "Tracking";
export const DIALER_CALL_TAG = "dialer app call";
export const CLIENT_CALL_TAG = "client app call";
const CLIENT_APP_CALL_WORKFLOW = "Client App Call";

// Names compared on letters and digits only. The snapshot puts an emoji in
// front ("💻 App Call", AAG 2026-10-22), which an exact match missed.
export function workflowKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type AppCallResult = { ok: true } | { ok: false; message: string };

async function keyedWorkflows(gctx: GhlContext): Promise<GhlWorkflowSummary[]> {
  const res = await ghlJson<{ workflows?: GhlWorkflowSummary[] }>(
    gctx,
    `/workflows/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return (res.workflows ?? []).map((w) => ({ ...w, name: workflowKey(w.name ?? "") }));
}

export async function startAppCall(gctx: GhlContext, contactId: string): Promise<AppCallResult> {
  let keyed: GhlWorkflowSummary[];
  try {
    keyed = await keyedWorkflows(gctx);
  } catch (err) {
    return { ok: false, message: `Could not read the workflows: ${readableError(err)}` };
  }

  let pick = pickBridgeWorkflow(keyed, workflowKey(APP_CALL_WORKFLOW));
  if (!pick.ok && pick.error === "workflow_missing") {
    pick = pickBridgeWorkflow(keyed, workflowKey(APP_CALL_FALLBACK));
  }
  if (!pick.ok && pick.error === "workflow_missing") {
    const tracking = pickBridgeWorkflow(keyed, workflowKey(TRACKING_WORKFLOW));
    if (tracking.ok) {
      try {
        await fireCallTag(gctx, contactId, DIALER_CALL_TAG);
      } catch (err) {
        return { ok: false, message: `Could not start the call: ${readableError(err)}` };
      }
      return { ok: true };
    }
    if (tracking.error === "workflow_draft") {
      return { ok: false, message: `"${TRACKING_WORKFLOW}" is in draft in this sub-account. Publish it.` };
    }
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

// The tag the owner's Call button adds. Older clients ring the owner from
// "New Lead Auto Call" on `call now`; the restructured snapshot (and Comfort
// Wizards) from `client app call`. Comfort Wizards listens for both, so the
// app adds one, never both, or the owner is rung twice.
export async function ownerCallTag(gctx: GhlContext): Promise<string> {
  try {
    const keys = new Set((await keyedWorkflows(gctx)).map((w) => w.name));
    const usesClientTag = keys.has(workflowKey(TRACKING_WORKFLOW)) || keys.has(workflowKey(CLIENT_APP_CALL_WORKFLOW));
    return usesClientTag ? CLIENT_CALL_TAG : CALL_NOW_TAG;
  } catch {
    return CALL_NOW_TAG;
  }
}
