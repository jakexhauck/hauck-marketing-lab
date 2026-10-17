import { useMemo } from "react";
import { Check } from "lucide-react";
import type { BriefSectionId } from "../../../lib/agentWire";
import { BRIEF_BOXES, accountChecksFor } from "../../../lib/briefChecklist";
import {
  useAdminClientsQuery,
  useAdminOnboardingChecklistQuery,
  useAdminOnboardingChecklistToggle,
  useClientAccountsQuery,
} from "../../../hooks/useApi";
import { AccountCheckBox } from "../cockpit/AccountChecks";
import SetupActions from "../onboarding/SetupActions";
import { adminHomeFor } from "../../../routes/admin/AdminLayout";

// The boxes under a Client Brief section (Brief v2, Jake, 2026-10-17): the
// setup checklist items for that section (lib/briefChecklist.ts), saved as the
// same "sop:" ticks the old checklist pages wrote, then the section's Accounts
// checks as auto boxes that follow the live check.
//
// Jake ticks or unticks any manual box here; agents tick their own with a
// ```tick block (functions/lib/briefTicks.ts).

export function SectionBoxes({ tenantId, section }: { tenantId: string; section: BriefSectionId }) {
  const groups = BRIEF_BOXES[section];
  const autoIds = accountChecksFor(section);
  if (groups.length === 0 && autoIds.length === 0) return null;
  return (
    <div className="brf-boxes">
      {groups.length > 0 && <ManualBoxes tenantId={tenantId} section={section} />}
      {autoIds.length > 0 && <AutoBoxes tenantId={tenantId} section={section} />}
    </div>
  );
}

function ManualBoxes({ tenantId, section }: { tenantId: string; section: BriefSectionId }) {
  const checklist = useAdminOnboardingChecklistQuery(tenantId);
  const toggle = useAdminOnboardingChecklistToggle(tenantId);
  const done = useMemo(
    () => new Set((checklist.data?.items ?? []).filter((i) => i.done).map((i) => i.task_key)),
    [checklist.data],
  );
  const groups = BRIEF_BOXES[section];

  if (checklist.isLoading) return <div className="brf-box-note">Loading...</div>;
  if (checklist.isLoadingError) return <div className="brf-box-note">Checklist did not load.</div>;

  return (
    <>
      {groups.map((g, gi) => (
        <div key={`${g.label ?? "none"}-${gi}`}>
          {g.label && groups.length > 1 && <p className="brf-box-group">{g.label}</p>}
          {g.items.map((item) => {
            const isDone = done.has(item.key);
            const flip = () => toggle.mutate({ taskKey: item.key, done: !isDone });
            return (
              <div key={item.key} className="brf-box">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={item.label}
                  onClick={flip}
                  className={`brf-check${isDone ? " on" : ""}`}
                >
                  {isDone && <Check size={13} strokeWidth={3} aria-hidden />}
                </button>
                <div className="brf-box-body">
                  <button type="button" onClick={flip} className={`brf-box-label${isDone ? " on" : ""}`}>
                    {item.label}
                  </button>
                  {item.note && <p className="brf-box-sub">{item.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function AutoBoxes({ tenantId, section }: { tenantId: string; section: BriefSectionId }) {
  const clients = useAdminClientsQuery(true);
  const client = clients.data?.clients.find((c) => c.id === tenantId) ?? null;
  const query = useClientAccountsQuery(tenantId);
  const ids = accountChecksFor(section);
  const checks = (query.data?.checks ?? []).filter((c) => ids.includes(c.id));
  checks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  if (query.isLoading) return <div className="brf-box-note">Checking...</div>;
  if (query.isLoadingError) return <div className="brf-box-note">{(query.error as Error).message || "Could not check."}</div>;
  if (!client) return null;
  return (
    <>
      {checks.map((c) => (
        <AccountCheckBox key={c.id} check={c} client={client} locationId={query.data?.locationId ?? null} />
      ))}
    </>
  );
}

// Software setup, Create client folder and Go live, at the top of Status
// (moved from Full Setup Checklist).
export function StatusActions({ tenantId }: { tenantId: string }) {
  return (
    <div className="brf-actions-row">
      <SetupActions tenantId={tenantId} home={adminHomeFor("owner")} />
    </div>
  );
}
