import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "../../ui/Button";
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

interface Row {
  key: string;
  name: string;
  sub: string;
  initials: string;
  color: string;
  /** Present for a real client. Absent for a form nobody has stood up yet. */
  tenantId?: string;
  submissionId?: string;
}

export default function OnboardingList() {
  const roster = useAdminOnboardingListQuery();
  const forms = useIntakeQueue("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const clients: Row[] = (roster.data?.clients ?? [])
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
    const pending: Row[] = (forms.data?.submissions ?? [])
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
          <ListRow
            key={row.key}
            row={row}
            open={openKey === row.key}
            onToggle={() => setOpenKey((k) => (k === row.key ? null : row.key))}
          />
        ))}
      </div>
    </div>
  );
}

function ListRow({
  row,
  open,
  onToggle,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={
        "overflow-hidden rounded-[var(--radius-lg)] border bg-surface transition-shadow " +
        (open
          ? "border-border-strong shadow-[var(--shadow-md)]"
          : "border-border shadow-[var(--shadow-sm)]")
      }
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] font-display text-[11px] font-bold text-white"
            style={{ background: row.color }}
            aria-hidden
          >
            {row.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.015em] text-text">
              {row.name}
            </span>
            <span className="block truncate text-[11.5px] text-faint">{row.sub}</span>
          </span>
        </button>

        {/* Only a real client can be made live. A form with no account behind it
            has nothing to flip, so the slot is empty rather than lying. */}
        {row.tenantId && <GoLiveButton tenantId={row.tenantId} name={row.name} />}

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-faint hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight
            size={15}
            className={"transition-transform " + (open ? "rotate-90" : "")}
            aria-hidden
          />
        </button>
      </div>

      {open &&
        (row.tenantId ? (
          <ClientSheet tenantId={row.tenantId} />
        ) : (
          <SubmissionSheet submissionId={row.submissionId!} />
        ))}
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

/** "Windows and siding · Meridian, ID", skipping whatever is missing. */
function subtitle(niche: string, city: string, region: string): string {
  const place = [city, region].filter(Boolean).join(", ");
  return [niche, place].filter(Boolean).join(" · ");
}
