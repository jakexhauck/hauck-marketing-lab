import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Eye, UserCog } from "lucide-react";
import DeliveryRoster from "../../components/admin/DeliveryRoster";
import ClientConfigPanel from "../../components/admin/ClientConfigPanel";
import OverviewTab from "../../components/admin/cockpit/OverviewTab";
import { useAuth } from "../../context/AuthContext";
import { useAdminClientDetailQuery } from "../../hooks/useApi";
import { healthLabel } from "../../lib/deliveryRoster";
import { activeStaffCount } from "../../lib/cockpitOverview";
import {
  COCKPIT_TABS,
  cockpitPlaceholder,
  resolveCockpitTab,
  type CockpitTab,
} from "../../lib/deliveryCockpit";
import { ApiError, type AdminClientDetail } from "../../lib/api";

// Per-client Service Delivery cockpit (/admin/delivery/:tenantId). The roster
// rail stays on the left (highlighting this tenant); the main region gets a
// tenant header + a tab bar. Overview and Config are the working tabs
// (Task 3.2 shipped Config, Task 3.3 shipped Overview) and Overview is the
// default; every other tab is an honest placeholder later phases fill.
//
// Identity comes from useAdminClientDetailQuery(tenantId) - the same hook the
// Overview tab reads - so the header and Overview share one cached request
// instead of each fetching the client separately. The Config tab keeps its
// own detail fetch inside ClientConfigPanel (it owns its own save flows).

const HEALTH_COLOR: Record<AdminClientDetail["healthStatus"], string> = {
  healthy: "var(--positive)",
  warn: "var(--brand)",
  paused: "var(--text-faint)",
};

export default function DeliveryCockpit() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveCockpitTab(searchParams.get("tab"));

  const detailQuery = useAdminClientDetailQuery(tenantId);

  const setTab = (tab: CockpitTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  // "Enter live app" reused by both the header and the Overview tab's quick
  // actions, so there is exactly one previewClient(tenantId) call site.
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const enterLiveApp = async () => {
    setPreviewBusy(true);
    setPreviewErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setPreviewErr(res.error ?? "Could not open the live app");
      setPreviewBusy(false);
    }
  };

  if (detailQuery.isLoading) {
    return (
      <div className="pk-delivery-shell">
        <DeliveryRoster selectedTenantId={tenantId} />
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
        <DeliveryRoster selectedTenantId={tenantId} />
        <div className="pk-root">
          <Link to="/admin/delivery" className="pk-back">
            <ChevronLeft />
            Back to roster
          </Link>
          <div className="pk-empty">
            {notFound ? "Client not found." : "Could not load this client."}
          </div>
        </div>
      </div>
    );
  }

  const { client, staff } = detailQuery.data;

  return (
    <div className="pk-delivery-shell">
      <DeliveryRoster selectedTenantId={tenantId} />

      <div className="pk-root">
        <Link to="/admin/delivery" className="pk-back">
          <ChevronLeft />
          Service Delivery
        </Link>

        <CockpitHeader
          client={client}
          memberCount={activeStaffCount(staff)}
          onViewAsOwner={() => goToTeam(activeTab, setTab)}
          onEnterLiveApp={enterLiveApp}
          busy={previewBusy}
          err={previewErr}
        />

        <nav className="pk-tabs" aria-label="Client cockpit sections">
          {COCKPIT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pk-tab${activeTab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {activeTab === "config" ? (
          <ClientConfigPanel tenantId={tenantId} />
        ) : activeTab === "overview" ? (
          <OverviewTab
            tenantId={tenantId}
            onGoToConfig={() => setTab("config")}
            onEnterLiveApp={enterLiveApp}
            previewBusy={previewBusy}
            previewErr={previewErr}
          />
        ) : (
          <div className="pk-empty">
            {cockpitPlaceholder(COCKPIT_TABS.find((t) => t.id === activeTab)!)}
          </div>
        )}
      </div>
    </div>
  );
}

// Switch to Config and scroll to the Team section (where per-staff "View as"
// lives). Retries a few animation frames because the Config panel fetches its
// detail async, so #cockpit-team is not in the DOM on the first frame.
function goToTeam(activeTab: CockpitTab, setTab: (t: CockpitTab) => void) {
  if (activeTab !== "config") setTab("config");
  let tries = 0;
  const tick = () => {
    const el = document.getElementById("cockpit-team");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (tries++ < 60) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function CockpitHeader({
  client,
  memberCount,
  onViewAsOwner,
  onEnterLiveApp,
  busy,
  err,
}: {
  client: AdminClientDetail;
  memberCount: number;
  onViewAsOwner: () => void;
  onEnterLiveApp: () => Promise<void>;
  busy: boolean;
  err: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {client.niche && (
              <span className="text-[13px] text-muted">{client.niche}</span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-text"
              title="Account health"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: HEALTH_COLOR[client.healthStatus] } as CSSProperties}
                aria-hidden
              />
              {healthLabel(client.healthStatus)}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-muted">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onViewAsOwner}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
          >
            <UserCog size={15} /> View as owner
          </button>
          <button
            type="button"
            onClick={() => void onEnterLiveApp()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Eye size={15} /> {busy ? "Opening..." : "Enter live app"}
          </button>
        </div>
        {err && <span className="text-[12px] text-danger">{err}</span>}
      </div>
    </div>
  );
}
