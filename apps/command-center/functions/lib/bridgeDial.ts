import type { Env } from "./env";
import { ghlJson } from "./ghl";
import { agencyGhlUserId, getAgencyGhlContext } from "./agencyGhl";
import { readableError } from "./agencyCrm";
import { bridgeWorkflowName, ghlEventStartTime, pickBridgeWorkflow, type BridgeFailure, type GhlWorkflowSummary } from "./coldCallBridge";

// Ring Jake's phone, then bridge an agency GHL contact from the agency number:
// assign the contact to Jake, then enrol it in the bridge workflow (the rules
// and the why are in coldCallBridge.ts). Shared by the Cold Call card and the
// Cold SMS prospect panel, which both start from a contact that exists.

export type RingResult =
  | { ok: true; assignError: string | null }
  | { ok: false; error: BridgeFailure; detail: string | null };

export async function ringAndBridge(env: Env, contactId: string): Promise<RingResult> {
  const ghl = getAgencyGhlContext(env);

  // The Call action rings THE USER ASSIGNED TO THE CONTACT, and falls back to the
  // company phone number when nobody is assigned. That is GHL's rule and there is
  // no way to pass a recipient with the enrolment, so the assignment IS the
  // routing: set it first or the call rings the main line instead of the person
  // who pressed the button.
  let assignError: string | null = null;
  try {
    await ghlJson(ghl, `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      body: JSON.stringify({ assignedTo: agencyGhlUserId(env) }),
    });
  } catch (err) {
    // Not fatal. An unassigned contact still gets called, just from the company
    // number. Reported so a wrong recipient is diagnosable.
    assignError = readableError(err);
  }

  let workflows: GhlWorkflowSummary[];
  try {
    const res = await ghlJson<{ workflows?: GhlWorkflowSummary[] }>(
      ghl,
      `/workflows/?locationId=${encodeURIComponent(ghl.locationId)}`,
    );
    workflows = res.workflows ?? [];
  } catch (err) {
    return { ok: false, error: "enroll_failed", detail: readableError(err) };
  }

  const pick = pickBridgeWorkflow(workflows, bridgeWorkflowName(env));
  if (!pick.ok) return { ok: false, error: pick.error, detail: null };

  try {
    await ghlJson(ghl, `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(pick.id)}`, {
      method: "POST",
      body: JSON.stringify({ eventStartTime: ghlEventStartTime(new Date()) }),
    });
  } catch (err) {
    return { ok: false, error: "enroll_failed", detail: readableError(err) };
  }
  return { ok: true, assignError };
}
