import { Link, useParams } from "react-router-dom";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import OnboardingRoster from "../../components/admin/onboarding/OnboardingRoster";
import OnboardingRecord from "../../components/admin/onboarding/record/OnboardingRecord";
import { useAdminClientDetailQuery } from "../../hooks/useApi";
import { ApiError } from "../../lib/api";

// One client's onboarding record (/admin/onboarding/:tenantId). Same shell as
// the Fulfillment cockpit - roster rail, client header, one working surface -
// so moving between the two feels like the same console rather than two apps.
//
// The header carries a link across to that client's cockpit, because the
// question after "are they set up" is usually "so what are we running for them".

export default function OnboardingClient() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const detailQuery = useAdminClientDetailQuery(tenantId);

  if (detailQuery.isLoading) {
    return (
      <div className="pk-delivery-shell">
        <OnboardingRoster selectedTenantId={tenantId} />
        <div className="pk-root">
          <div className="pk-empty">Loading client...</div>
        </div>
      </div>
    );
  }

  if (!detailQuery.data) {
    const notFound = detailQuery.error instanceof ApiError && detailQuery.error.status === 404;
    return (
      <div className="pk-delivery-shell">
        <OnboardingRoster selectedTenantId={tenantId} />
        <div className="pk-root">
          <Link to="/admin/onboarding" className="pk-back">
            <ChevronLeft />
            Onboarding
          </Link>
          <div className="pk-empty">
            {notFound ? "Client not found." : "Could not load this client."}
          </div>
        </div>
      </div>
    );
  }

  const { client } = detailQuery.data;

  return (
    <div className="pk-delivery-shell">
      <OnboardingRoster selectedTenantId={tenantId} />

      <div className="pk-root">
        <Link to="/admin/onboarding" className="pk-back">
          <ChevronLeft />
          Onboarding
        </Link>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[16px] font-bold"
              style={{ background: client.brandColor || "var(--brand-primary)", color: "#fff" }}
              aria-hidden
            >
              {client.brandInitials || client.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="pk-title !mt-0 truncate">{client.name}</h1>
              {client.niche && (
                <div className="mt-1.5 text-[13px] text-muted">{client.niche}</div>
              )}
            </div>
          </div>

          <Link
            to={`/admin/delivery/${tenantId}`}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[var(--radius)] border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
          >
            <LayoutGrid size={15} /> Open cockpit
          </Link>
        </div>

        <OnboardingRecord tenantId={tenantId} />
      </div>
    </div>
  );
}
