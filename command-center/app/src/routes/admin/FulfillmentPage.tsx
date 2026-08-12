import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, HeartHandshake } from "lucide-react";
import ClientPicker from "../../components/admin/ClientPicker";
import PickPrompt from "../../components/admin/PickPrompt";
import GhlTab from "../../components/admin/cockpit/ghl/GhlTab";
import ManagementTab from "../../components/admin/cockpit/ManagementTab";
import PaidAdsTab from "../../components/admin/cockpit/paidads/PaidAdsTab";
import SoftwareTab from "../../components/admin/cockpit/software/SoftwareTab";
import { useAuth } from "../../context/AuthContext";
import { useSelectedClient } from "../../hooks/useSelectedClient";
import AdminPage from "../../components/admin/AdminPage";
import { CLIENT_HOME } from "../../lib/nav";
import {
  ADS_SETUP_SUB,
  DEFAULT_FULFILLMENT_PAGE,
  fulfillmentPath,
  getFulfillmentPage,
  paidAdsSubTabs,
  placeholderCopy,
  resolveGatedSubTab,
  resolveSubTab,
  subTabsFor,
  type FulfillmentPageDef,
} from "../../lib/fulfillmentPages";

// One Fulfillment service page (/admin/fulfillment/:page).
//
// This replaces the per-client cockpit at /admin/delivery/:tenantId, which put
// the client in the URL and the service in a tab. The relationship is now the
// other way round: the service is the page (a real sidebar row), and the client
// is a picker on the title line whose choice carries to every other Fulfillment
// page. See lib/selectedClient.ts for how the pick is remembered.
//
// The service bodies themselves are untouched. They already took a tenantId
// prop, so they neither know nor care that it now comes from a picker rather
// than a route param.

export default function FulfillmentPage() {
  const { page: pageParam } = useParams<{ page: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { previewClient } = useAuth();

  // Every hook runs before the unknown-page redirect below, so hook order stays
  // stable when the route param changes while this component stays mounted
  // (which is exactly what a sidebar click does).
  const { clients, selected, tenantId, isLoading, isError, setClient } = useSelectedClient();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const page = getFulfillmentPage(pageParam);

  // Paid Ads hides its three Meta-backed pages until the client's ad account is
  // linked, and opens on the wizard that links it. Every other page is ungated,
  // so the two lines below are a no-op for them.
  const adAccountId = selected?.metaAdAccountId ?? null;
  const subs =
    pageParam === "paid-ads"
      ? paidAdsSubTabs(subTabsFor(pageParam), Boolean((adAccountId ?? "").trim()))
      : subTabsFor(pageParam);
  const activeSub =
    pageParam === "paid-ads"
      ? resolveGatedSubTab(subs, searchParams.get("sub"))
      : resolveSubTab(pageParam, searchParams.get("sub"));

  const setSub = (sub: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("sub", sub);
        return next;
      },
      { replace: true },
    );
  };

  const enterLiveApp = async () => {
    if (!tenantId) return;
    setPreviewBusy(true);
    setPreviewErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate(CLIENT_HOME, { replace: true });
    } else {
      setPreviewErr(res.error ?? "Could not open the live app");
      setPreviewBusy(false);
    }
  };

  // A typed or stale page id lands on Overview rather than a dead end.
  if (!page) {
    return <Navigate to={fulfillmentPath(DEFAULT_FULFILLMENT_PAGE, tenantId)} replace />;
  }

  return (
    <div className="pk-root">
      {/* Section name is the PAGE, not "Fulfillment": the pages here are chosen
          by route from the sidebar, so they cannot also be this panel's switcher.
          What switches in place is the page's own sections, which is exactly the
          shape the client app's Sales page has. The "Fulfillment" kicker is gone
          for the same reason PillarPage dropped its own: the rail already says
          where you are. */}
      <AdminPage
        section={page.label}
        tabs={subs.map((sub) => ({ id: sub.id, label: sub.label }))}
        active={activeSub ?? undefined}
        onSelect={setSub}
        actions={
          <>
            <ClientPicker
              clients={clients}
              selected={selected}
              loading={isLoading}
              error={isError}
              onSelect={setClient}
            />
            {tenantId && (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void enterLiveApp()}
                  disabled={previewBusy}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-60"
                >
                  <Eye size={15} /> {previewBusy ? "Opening..." : "Enter live app"}
                </button>
                {previewErr && <span className="text-[12px] text-danger">{previewErr}</span>}
              </div>
            )}
          </>
        }
      />

      <div className="pk-section">
        <PageBody
          page={page}
          tenantId={tenantId}
          clientName={selected?.name ?? ""}
          clientSlug={selected?.slug ?? ""}
          activeSub={activeSub}
          adAccountId={adAccountId}
          onSelectSub={setSub}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </div>
  );
}

// The body for the active page, once there is a client to render it for.
// Ordered so an honest "nothing to show" always wins over a client-shaped
// blank: loading, then failure, then no clients at all, then the surface.
function PageBody({
  page,
  tenantId,
  clientName,
  clientSlug,
  activeSub,
  adAccountId,
  onSelectSub,
  isLoading,
  isError,
}: {
  page: FulfillmentPageDef;
  tenantId: string | null;
  clientName: string;
  clientSlug: string;
  activeSub: string | null;
  adAccountId: string | null;
  onSelectSub: (sub: string) => void;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <div className="pk-empty">Loading clients...</div>;
  if (isError) return <div className="pk-empty">Could not load clients.</div>;

  if (!tenantId) {
    return (
      <PickPrompt
        icon={<HeartHandshake size={22} />}
        title="No clients yet"
        sub="Start one from Fulfillment > Onboarding, then it appears in the picker above."
      />
    );
  }

  if (!page.ready) {
    const subLabel = page.subTabs?.find((s) => s.id === activeSub)?.label;
    return <div className="pk-empty">{placeholderCopy(subLabel ?? page.label)}</div>;
  }

  switch (page.id) {
    case "software":
      return <SoftwareTab tenantId={tenantId} />;
    case "paid-ads":
      return (
        <PaidAdsTab
          tenantId={tenantId}
          clientName={clientName}
          activeSub={activeSub ?? ADS_SETUP_SUB}
          adAccountId={adAccountId}
          onSelectSub={onSelectSub}
        />
      );
    case "ghl":
      return (
        <GhlTab
          tenantId={tenantId}
          clientName={clientName}
          clientSlug={clientSlug}
          activeSub={activeSub ?? "conversion-assets"}
        />
      );
    case "management":
      return <ManagementTab tenantId={tenantId} />;
    default:
      // A page marked ready with no body wired is a bug, not a state to render
      // something plausible for.
      return <div className="pk-empty">{placeholderCopy(page.label)}</div>;
  }
}
