import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Eye, UserCog } from "lucide-react";
import DeliveryRoster from "../../components/admin/DeliveryRoster";
import ClientConfigPanel from "../../components/admin/ClientConfigPanel";
import { useAuth } from "../../context/AuthContext";
import { useAdminClientsQuery } from "../../hooks/useApi";
import { healthLabel } from "../../lib/deliveryRoster";
import {
  COCKPIT_TABS,
  cockpitPlaceholder,
  resolveCockpitTab,
  type CockpitTab,
} from "../../lib/deliveryCockpit";
import type { AdminClient } from "../../lib/api";

// Per-client Service Delivery cockpit (/admin/delivery/:tenantId). The roster
// rail stays on the left (highlighting this tenant); the main region gets a
// tenant header + a tab bar. Config is the only working tab this task and is
// the default; every other tab is an honest placeholder that later phases
// fill. Tenant identity comes from the already-loaded roster list (no new
// endpoint); the Config tab's own detail fetch lives inside ClientConfigPanel.

const HEALTH_COLOR: Record<AdminClient["healthStatus"], string> = {
  healthy: "var(--positive)",
  warn: "var(--brand)",
  paused: "var(--text-faint)",
};

export default function DeliveryCockpit() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveCockpitTab(searchParams.get("tab"));

  const clientsQuery = useAdminClientsQuery(true);
  const client = (clientsQuery.data?.clients ?? []).find((c) => c.id === tenantId);

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

  if (clientsQuery.isLoading) {
    return (
      <div className="pk-delivery-shell">
        <DeliveryRoster selectedTenantId={tenantId} />
        <div className="pk-root">
          <div className="pk-empty">Loading client...</div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="pk-delivery-shell">
        <DeliveryRoster selectedTenantId={tenantId} />
        <div className="pk-root">
          <Link to="/admin/delivery" className="pk-back">
            <ChevronLeft />
            Back to roster
          </Link>
          <div className="pk-empty">
            {clientsQuery.isError ? "Could not load this client." : "Client not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pk-delivery-shell">
      <DeliveryRoster selectedTenantId={tenantId} />

      <div className="pk-root">
        <Link to="/admin/delivery" className="pk-back">
          <ChevronLeft />
          Service Delivery
        </Link>

        <CockpitHeader client={client} tenantId={tenantId} onViewAsOwner={() => goToTeam(activeTab, setTab)} />

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
  tenantId,
  onViewAsOwner,
}: {
  client: AdminClient;
  tenantId: string;
  onViewAsOwner: () => void;
}) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enterLiveApp = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setErr(res.error ?? "Could not open the live app");
      setBusy(false);
    }
  };

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
              {client.memberCount} {client.memberCount === 1 ? "member" : "members"}
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
            onClick={() => void enterLiveApp()}
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
