import { useMemo, useState } from "react";
import { Button } from "../../ui/Button";
import AccountRow, { subtitle, type AccountRowData } from "./AccountRow";
import { ClientSheet, SubmissionSheet } from "./OnboardingSheet";
import { useAdminOnboardingGoLive, useAdminOnboardingListQuery } from "../../../hooks/useApi";
import { useIntakeQueue } from "../../../hooks/useIntake";

// Onboarding: one flat list of everyone being stood up.
//
// No tabs, no client picker, no checklist, and no headings splitting the list.
// A row is a name, what they do, where they are, and Go live. Open one and you
// get their sheet. That is the whole page.
//
// Clients still in setup and forms that never became a client sit in the same
// list on purpose: sorting them into groups was work Jake had to do with his
// eyes before he could do the work he came for.
//
// Once Go live is pressed a client drops off this list and appears on
// Operations > Clients, which is the same list and the same sheet for the ones
// already running.

export default function OnboardingList() {
  const roster = useAdminOnboardingListQuery();
  const forms = useIntakeQueue("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rows = useMemo<AccountRowData[]>(() => {
    const clients: AccountRowData[] = (roster.data?.clients ?? [])
      .filter((c) => c.onboardingStatus === "setup")
      .map((c) => ({
        key: `client:${c.id}`,
        name: c.name,
        sub: subtitle(c.niche, c.city, c.region) || c.slug,
        initials: c.brandInitials || c.name.slice(0, 2).toUpperCase(),
        color: c.brandColor || "var(--brand)",
        tenantId: c.id,
      }));

    // Only the forms that never became a client. A finished form creates the
    // client itself, so anything with a tenant is already a row above.
    const pending: AccountRowData[] = (forms.data?.submissions ?? [])
      .filter((s) => !s.tenantId && s.status !== "rejected")
      .map((s) => ({
        key: `form:${s.id}`,
        name: s.name,
        sub: s.niche || s.contactName || "Filled the form in, no account yet",
        initials: s.name.slice(0, 2).toUpperCase(),
        color: "var(--surface-3)",
        submissionId: s.id,
      }));

    return [...clients, ...pending];
  }, [roster.data, forms.data]);

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
          ? "Nobody is being set up. Add a client, or send someone the form."
          : `${rows.length} ${rows.length === 1 ? "account" : "accounts"}. Open one for their details.`}
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <AccountRow
            key={row.key}
            row={row}
            open={openKey === row.key}
            onToggle={() => setOpenKey((k) => (k === row.key ? null : row.key))}
            // Only a real client can be made live. A form with no account behind
            // it has nothing to flip, so the slot is empty rather than lying.
            action={
              row.tenantId && <GoLiveButton tenantId={row.tenantId} name={row.name} />
            }
          >
            {row.tenantId ? (
              <ClientSheet tenantId={row.tenantId} />
            ) : (
              <SubmissionSheet submissionId={row.submissionId!} />
            )}
          </AccountRow>
        ))}
      </div>
    </div>
  );
}

function GoLiveButton({ tenantId, name }: { tenantId: string; name: string }) {
  const goLive = useAdminOnboardingGoLive(tenantId);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {goLive.isError && (
        <span className="text-[12px] font-medium text-danger">
          {(goLive.error as Error)?.message ?? "That did not work."}
        </span>
      )}
      <Button
        size="sm"
        variant="primary"
        loading={goLive.isPending}
        onClick={() => goLive.mutate()}
        aria-label={`Make ${name} live`}
      >
        Go live
      </Button>
    </div>
  );
}
