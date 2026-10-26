import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Eye } from "lucide-react";
import GhlTab from "../../components/admin/cockpit/ghl/GhlTab";
import ManagementTab from "../../components/admin/cockpit/ManagementTab";
import ImageConverterTab from "../../components/admin/cockpit/ImageConverterTab";
import SettingTab from "../../components/admin/setting/SettingTab";
import AgentPage from "../../components/admin/agents/AgentPage";
import { MissionBrief } from "../../components/admin/brief/MissionBrief";
import ClientDirector from "../../components/admin/director/ClientDirector";
import PaidAdsTab from "../../components/admin/cockpit/paidads/PaidAdsTab";
import { adminHomeFor } from "./AdminLayout";
import { useAuth } from "../../context/AuthContext";
import { useAdminClientsQuery } from "../../hooks/useApi";
import { CLIENT_HOME } from "../../lib/nav";
import { clientPath, resolveClientPage, type ClientPageId } from "../../lib/clientNav";
import { ADS_SETUP_SUB, GHL_SETUP_SUB } from "../../lib/fulfillmentPages";
import { writeStoredClient } from "../../lib/selectedClient";
import type { AdminClient } from "../../lib/api";
import { isAgentId } from "../../lib/agents";

// One page of a client's sub-account (/admin/client/:tenantId/:page/:sub?).
//
// Replaces the Fulfillment service pages (Jake, 2026-10-05). The client used to
// be a picker on each page; now it is the address, chosen on the client strip,
// and the sub-pages (Paid Ads' Dashboard, Lead Tracker, ...) are sidebar rows
// rather than a tab bar here. So this page has no header of its own: the only
// control left is the way into the client's live app, pinned top right.
//
// The service bodies are the same components the Fulfillment pages rendered.

const OWNER_HOME = adminHomeFor("owner");

export default function ClientPage() {
  const { tenantId = "", page = "", sub } = useParams<{ tenantId: string; page: string; sub?: string }>();
  const clientsQuery = useAdminClientsQuery(true);
  const client = clientsQuery.data?.clients.find((c) => c.id === tenantId) ?? null;

  // Remembered so an old link with no client in it (a Fulfillment bookmark)
  // lands on the sub-account you were last in.
  useEffect(() => {
    if (client) writeStoredClient(client.id);
  }, [client]);

  if (clientsQuery.isLoading) return <div className="pk-root"><div className="pk-empty">Loading...</div></div>;
  if (clientsQuery.isLoadingError) return <div className="pk-root"><div className="pk-empty">Could not load clients.</div></div>;
  // A removed or mistyped client: back to the agency rather than a blank page.
  if (!client) return <Navigate to={OWNER_HOME} replace />;

  const resolved = resolveClientPage(client, page, sub ?? null);
  if (!resolved) return <Navigate to={clientPath(client.id, "brief")} replace />;
  if (resolved.page !== page || resolved.sub !== (sub ?? null)) {
    return <Navigate to={clientPath(client.id, resolved.page, resolved.sub)} replace />;
  }

  // An agent page is a full-height three-column frame (chats | chat | panel),
  // edge to edge like the mockup, so it skips the padded page and the live
  // app button.
  if (resolved.page === "agent") {
    return <AgentPage tenantId={client.id} agent={isAgentId(resolved.sub) && resolved.sub !== "manager" ? resolved.sub : "csm"} />;
  }

  return (
    <div className="pk-root">
      <div className="mb-5 flex justify-end">
        <LiveAppButton tenantId={client.id} />
      </div>
      <div className="pk-section">
        <PageBody client={client} page={resolved.page} sub={resolved.sub} />
      </div>
    </div>
  );
}

function LiveAppButton({ tenantId }: { tenantId: string }) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enter = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate(CLIENT_HOME, { replace: true });
    } else {
      setErr(res.error ?? "Could not open the live app");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void enter()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-60"
      >
        <Eye size={15} /> {busy ? "Opening..." : "Enter live app"}
      </button>
      {err && <span className="text-[12px] text-danger">{err}</span>}
    </div>
  );
}

function PageBody({ client, page, sub }: { client: AdminClient; page: ClientPageId; sub: string | null }) {
  const navigate = useNavigate();
  // The connect wizards hand over to a sub-page when they finish.
  const go = (p: ClientPageId) => (next: string) => navigate(clientPath(client.id, p, next));

  switch (page) {
    case "brief":
      return <MissionBrief tenantId={client.id} brandColor={client.brandColor} sub={sub} />;
    case "director":
      return <ClientDirector tenantId={client.id} />;
    case "paid-ads":
      return (
        <PaidAdsTab
          tenantId={client.id}
          clientName={client.name}
          activeSub={sub ?? ADS_SETUP_SUB}
          adAccountId={client.metaAdAccountId}
          onSelectSub={go("paid-ads")}
        />
      );
    case "ghl":
      return (
        <GhlTab
          tenantId={client.id}
          clientName={client.name}
          locationId={client.ghlLocationId}
          activeSub={sub ?? GHL_SETUP_SUB}
          ghlConnected={client.ghlConnected}
          onSelectSub={go("ghl")}
        />
      );
    case "management":
      return (
        <ManagementTab
          tenantId={client.id}
          clientName={client.name}
          isLive={client.onboardingStatus !== "setup"}
        />
      );
    case "image-converter":
      return <ImageConverterTab tenantId={client.id} />;
    case "setting":
      return <SettingTab tenantId={client.id} sub={sub} />;
    case "agent":
      return <AgentPage tenantId={client.id} agent={isAgentId(sub) && sub !== "manager" ? sub : "csm"} />;
  }
}
