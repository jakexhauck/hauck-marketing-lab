import { useMemo, useState } from "react";
import AccountRow, {
  subtitle,
  type AccountRowData,
} from "../onboarding/AccountRow";
import { ClientSheet } from "../onboarding/OnboardingSheet";
import { useAdminOnboardingListQuery } from "../../../hooks/useApi";

// Operations > Clients: everyone we are already running.
//
// The same list and the same sheet as Onboarding, one step further down the
// line. Onboarding holds the ones being stood up and drops a client the moment
// Go live is pressed; this holds them from that moment on, so what the client
// told us stays reachable for the whole life of the account instead of
// disappearing off the only page that showed it.
//
// No Go live here: these are live already, and a button that does nothing is
// worse than no button.

export default function ClientsTab() {
  const roster = useAdminOnboardingListQuery();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rows = useMemo<AccountRowData[]>(
    () =>
      (roster.data?.clients ?? [])
        .filter((c) => c.onboardingStatus !== "setup")
        .map((c) => ({
          key: `client:${c.id}`,
          name: c.name,
          sub: subtitle(c.niche, c.city, c.region) || c.slug,
          initials: c.brandInitials || c.name.slice(0, 2).toUpperCase(),
          color: c.brandColor || "var(--brand)",
          tenantId: c.id,
        })),
    [roster.data],
  );

  if (roster.isLoading) {
    return <p className="mt-6 text-[13px] text-muted">Loading...</p>;
  }

  if (roster.isError) {
    return <p className="mt-6 text-[13px] text-danger">The list did not load.</p>;
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        {rows.length === 0
          ? "No clients are live yet. They appear here once Go live is pressed on Onboarding."
          : `${rows.length} ${rows.length === 1 ? "client" : "clients"}. Open one for their details.`}
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <AccountRow
            key={row.key}
            row={row}
            open={openKey === row.key}
            onToggle={() => setOpenKey((k) => (k === row.key ? null : row.key))}
          >
            <ClientSheet tenantId={row.tenantId!} />
          </AccountRow>
        ))}
      </div>
    </div>
  );
}
