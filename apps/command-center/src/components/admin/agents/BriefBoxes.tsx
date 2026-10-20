import type { BriefSectionId } from "../../../lib/agentWire";
import { accountChecksFor } from "../../../lib/briefChecklist";
import { useAdminClientsQuery, useClientAccountsQuery } from "../../../hooks/useApi";
import { AccountCheckBox } from "../cockpit/AccountChecks";
import SetupActions from "../onboarding/SetupActions";
import { adminHomeFor } from "../../../routes/admin/AdminLayout";

// The account checks under a Client Brief section (Brief v2, Jake,
// 2026-10-17): auto rows that follow the live check. The tickable setup boxes
// that sat here moved to the client's Director (Jake, 2026-10-21).

export function SectionBoxes({ tenantId, section }: { tenantId: string; section: BriefSectionId }) {
  if (accountChecksFor(section).length === 0) return null;
  return (
    <div className="brf-boxes">
      <AutoBoxes tenantId={tenantId} section={section} />
    </div>
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
