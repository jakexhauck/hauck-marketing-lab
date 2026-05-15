// Onboarding → GoHighLevel sync orchestrator.
//
// One direction: the HML OnboardingChecklist is the source of truth.
// When a phase flips from incomplete to complete, we advance the
// matching GHL opportunity to the next stage so GHL workflows
// (client emails, internal reminders, dashboards) fire automatically.
//
// Idempotency:
//   * Per-client GHL contact + opportunity IDs are cached in
//     ops/clients.json (rows[slug].ghlContactId / ghlOpportunityId).
//     First sync looks the contact up by email or creates one; subsequent
//     syncs reuse the cached IDs to skip the lookup.
//   * The Rust side compares current vs. target stage and no-ops if they
//     already match, so re-firing the same phase is safe.

import { api } from "./tauri";
import type { OpsClientsFile } from "./types";

/** Pipeline-name fallback when no onboardingPipelineId is stored in config.
 *  Surfaces a clear error if the user hasn't picked one yet AND no name
 *  matches in their GHL location. */
export const ONBOARDING_PIPELINE_NAME_FALLBACK = "Client Onboarding";

/** Phase number (1-5) → GHL stage name as Jake configured the pipeline.
 *
 * "Invoice Paid" was Phase 1 prior to 2026-05-14. It's been removed — contract
 * signing + invoice payment are now persistent flags on the Client Hub
 * (`contractSignedAt`, `invoicePaidAt` on OpsClientRow), not workflow steps.
 *
 * The GHL pipeline itself may still contain an "Invoice Paid" stage; this
 * map simply doesn't target it. The app starts opportunities at "Onboarding
 * Call" and advances from there. */
const PHASE_STAGE_NAMES: Record<number, string> = {
  1: "Onboarding Call",
  2: "Technical Setup",
  3: "Creative Production",
  4: "Campaign Build",
  5: "Fully Launched",
};

export function stageNameForPhase(phaseNum: number): string | null {
  return PHASE_STAGE_NAMES[phaseNum] ?? null;
}

export interface SyncOnboardingArgs {
  root: string;
  clientSlug: string;
  clientName: string;
  clientEmail?: string | null;
  phaseNum: number;
}

export interface SyncResult {
  ok: boolean;
  /** Human-readable status for surfacing in the checklist header. */
  message: string;
  contactId?: string;
  opportunityId?: string;
  stageName?: string;
}

/**
 * Advance the GHL opportunity for `clientSlug` to the stage that
 * corresponds to `phaseNum`. Persists the returned contact/opportunity
 * IDs to ops/clients.json so subsequent syncs are cheap.
 *
 * Returns `{ ok: false }` when GHL isn't configured or the call fails;
 * callers should surface the message but never block the UI.
 */
export async function syncOnboardingPhase(args: SyncOnboardingArgs): Promise<SyncResult> {
  const stageName = stageNameForPhase(args.phaseNum);
  if (!stageName) {
    return { ok: false, message: `No GHL stage mapped to phase ${args.phaseNum}` };
  }

  // Short-circuit if user hasn't connected GHL yet — silently skip so the
  // checklist still works standalone. Also pull the chosen onboarding
  // pipeline ID so we target the correct one (the user may have multiple
  // pipelines whose names contain "onboard").
  let onboardingPipelineId: string | null = null;
  try {
    const status = await api.ghlGetConfigStatus();
    if (!status.configured) {
      return { ok: false, message: "GHL not configured" };
    }
    onboardingPipelineId = status.onboardingPipelineId ?? null;
  } catch {
    return { ok: false, message: "GHL not configured" };
  }

  // Look up cached IDs from ops/clients.json (best effort — if read fails
  // we just pass empty IDs and let the Rust side rediscover them).
  let ops: OpsClientsFile = { rows: {} };
  try {
    ops = await api.readOpsClients(args.root);
  } catch {
    // ignore — we'll write a fresh row at the end if the sync succeeds.
  }
  const existing = ops.rows[args.clientSlug] ?? {};

  try {
    const result = await api.ghlAdvanceOpportunity({
      clientName: args.clientName,
      clientEmail: args.clientEmail ?? null,
      pipelineId: onboardingPipelineId,
      pipelineName: onboardingPipelineId ? null : ONBOARDING_PIPELINE_NAME_FALLBACK,
      stageName,
      knownContactId: existing.ghlContactId ?? null,
      knownOpportunityId: existing.ghlOpportunityId ?? null,
    });

    // Write IDs back if either was missing or changed.
    const needsPersist =
      existing.ghlContactId !== result.contactId ||
      existing.ghlOpportunityId !== result.opportunityId;
    if (needsPersist) {
      try {
        await api.writeOpsClients(args.root, {
          rows: {
            ...ops.rows,
            [args.clientSlug]: {
              ...existing,
              ghlContactId: result.contactId,
              ghlOpportunityId: result.opportunityId,
            },
          },
        });
      } catch (err) {
        // Sync succeeded on GHL's side; we just couldn't cache the IDs.
        // Next sync will re-discover them. Not a hard failure.
        // eslint-disable-next-line no-console
        console.warn("ghlSync: failed to persist IDs to ops/clients.json", err);
      }
    }

    return {
      ok: true,
      message: `GHL: ${stageName}`,
      contactId: result.contactId,
      opportunityId: result.opportunityId,
      stageName,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `GHL sync failed: ${message}` };
  }
}
