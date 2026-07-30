import { useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { TaskState } from "./ChecklistCard";
import IntakeCard from "./IntakeCard";
import ReadinessCard from "./ReadinessCard";
import SetupValuesCard from "./SetupValuesCard";
import { OnboardingStyle } from "./OnboardingKit";
import {
  useAdminOnboardingChecklistQuery,
  useAdminOnboardingProvision,
  useAdminOnboardingQuery,
  useAdminOnboardingReadinessQuery,
  useAdminOnboardingSave,
} from "../../../../hooks/useApi";
import {
  CHECKLIST_TASKS,
  checklistProgress,
  onboardingStage,
} from "../../../../lib/onboarding";
import type { AdminProvisionResult } from "../../../../lib/api";

// One client's onboarding record: where they are, the values we push into their
// GHL sub-account, and their own intake answers.
//
// The upper half of the Client setup view. The steps themselves are below it
// (SetupSteps), on the same page, because working a step usually means reading
// an answer.
//
// The backend for all of this already existed (functions/api/admin/onboarding/*,
// tables from migration 0018) and had never had a screen. Nothing here is
// demo data; a client who has never been onboarded reads as empty, not as
// fabricated progress.

// Which checklist task each live GHL check answers. An auto task takes its
// state from GHL rather than from a saved tick, so the board cannot claim a
// client is connected when the token stopped working last week.
const READINESS_TASK: Record<string, string> = {
  token: "token-connected",
  custom_values: "provision-values",
  calendars: "calendars-present",
};

function errorText(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function OnboardingRecord({ tenantId }: { tenantId: string }) {
  const record = useAdminOnboardingQuery(tenantId);
  const checklist = useAdminOnboardingChecklistQuery(tenantId);
  const readiness = useAdminOnboardingReadinessQuery(tenantId);
  const provision = useAdminOnboardingProvision(tenantId);
  const saveFields = useAdminOnboardingSave(tenantId);

  // Provisioning writes into the client's live GHL sub-account, so the button
  // asks first. Inline, not a browser dialog: this is one destination-changing
  // action, not a modal-worthy flow.
  const [confirming, setConfirming] = useState(false);

  const checks = readiness.data?.checks ?? [];

  // The state each task is really in: saved ticks for the manual ones, live GHL
  // answers for the three that can be checked.
  const states: TaskState[] = useMemo(() => {
    const saved = new Map(
      (checklist.data?.items ?? []).map((i) => [i.task_key, i.done]),
    );
    const live = new Map<string, boolean>();
    for (const check of checks) {
      const key = READINESS_TASK[check.key];
      if (key) live.set(key, check.ok);
    }
    return CHECKLIST_TASKS.map((task) => ({
      taskKey: task.key,
      auto: task.auto,
      done: task.auto
        ? (live.get(task.key) ?? saved.get(task.key) ?? false)
        : (saved.get(task.key) ?? false),
    }));
  }, [checklist.data, checks]);

  const progress = checklistProgress(states);
  const status = record.data?.status ?? "draft";
  const stage = onboardingStage(status, progress);

  const fields = record.data?.fields ?? {};
  const canProvision = Boolean(record.data?.hasToken && (fields.ghl_location_id ?? "").trim());

  // The freshest thing we know about pushing values: this session's run if
  // there was one, otherwise whatever the last run recorded.
  const lastRun: AdminProvisionResult | null =
    provision.data ?? record.data?.provisionResult ?? null;

  if (record.isLoading) {
    return <div className="pk-empty">Loading onboarding...</div>;
  }
  if (record.isError) {
    return <div className="pk-empty">Could not load this client's onboarding record.</div>;
  }

  return (
    <div className="onb">
      <OnboardingStyle />

      <section className="onb-card">
        <div className="onb-strip">
          <div className="onb-strip-main">
            <div className="onb-stage">
              <span className="onb-stage-title">{stage}</span>
              <span className={`onb-pill ${status === "provisioned" ? "provisioned" : "draft"}`}>
                {status === "provisioned" ? "Provisioned" : "Draft"}
              </span>
              <span className="onb-count">
                {progress.done} of {progress.total} steps done
              </span>
            </div>

            {/* No phase spine here any more. Six phases and forty steps is the
                setup page's job; this header says where the client is, and the
                card below says how far through. */}
          </div>

          <div className="onb-strip-side">
            {confirming ? (
              <div className="onb-card-right">
                <button
                  type="button"
                  className="onb-btn ghost"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="onb-btn danger"
                  onClick={() => {
                    setConfirming(false);
                    provision.mutate();
                  }}
                >
                  <UploadCloud size={15} />
                  Yes, write to their GHL
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="onb-btn primary"
                disabled={!canProvision || provision.isPending}
                onClick={() => setConfirming(true)}
              >
                <UploadCloud size={15} />
                {provision.isPending ? "Pushing..." : "Push values to GHL"}
              </button>
            )}

            <ProvisionNote
              canProvision={canProvision}
              confirming={confirming}
              error={errorText(provision.error)}
              lastRun={lastRun}
            />
          </div>
        </div>
      </section>

      {/* Full width, not a column. This was half of a two-up with the link
          through to the steps; the steps are on this page now, so the grid had
          one child and a hole beside it. */}
      <ReadinessCard
        checks={checks}
        loading={readiness.isFetching}
        error={errorText(readiness.error)}
        onRecheck={() => void readiness.refetch()}
      />

      {/* Keyed by tenant: each card seeds its form once, on mount, so a
          background refetch cannot wipe what is being typed. Switching client
          in the roster remounts them with the new client's record. */}
      <SetupValuesCard
        key={`setup-${tenantId}`}
        fields={fields}
        hasToken={Boolean(record.data?.hasToken)}
        saving={saveFields.isPending}
        saved={saveFields.isSuccess}
        error={errorText(saveFields.error)}
        onSave={(values) => saveFields.mutate({ fields: values })}
      />

      <IntakeCard intake={record.data?.intake ?? {}} />

    </div>
  );
}

// One line under the push button saying what will happen, or what happened.
function ProvisionNote({
  canProvision,
  confirming,
  error,
  lastRun,
}: {
  canProvision: boolean;
  confirming: boolean;
  error: string | null;
  lastRun: AdminProvisionResult | null;
}) {
  if (error) return <p className="onb-err">{error}</p>;

  if (!canProvision) {
    return (
      <p className="onb-provision-note">
        Set the GHL location ID and token below before pushing anything.
      </p>
    );
  }

  if (confirming) {
    return (
      <p className="onb-provision-note">
        This overwrites the mapped custom values in the client's live sub-account.
      </p>
    );
  }

  if (!lastRun) {
    return (
      <p className="onb-provision-note">
        Writes every setup value below into their sub-account. Nothing has been pushed yet.
      </p>
    );
  }

  return (
    <p className="onb-provision-note">
      Last push wrote <b>{lastRun.written.length}</b>{" "}
      {lastRun.written.length === 1 ? "value" : "values"}
      {lastRun.failed.length > 0 && (
        <>
          , <b>{lastRun.failed.length}</b> failed
        </>
      )}
      {lastRun.notFound.length > 0 && (
        <>
          . Missing from their sub-account: {lastRun.notFound.join(", ")}
        </>
      )}
      .
    </p>
  );
}
