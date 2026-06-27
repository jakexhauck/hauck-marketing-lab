// One client's paid-ads tracker, mirroring the per-client sheet. Three sub-tabs
// (Dashboard, Lead Tracker, Meta Data) switched by local state (no route
// change). Lead status + value edits live in local state and recompute the
// funnel immediately, so the Dashboard reacts the way the sheet does. Mock data
// for now via getMockAdsClient; swap the source when real data is wired.

import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PillarStyle } from "../../components/pillars/PillarKit";
import { getMockAdsClient } from "../../lib/mockAds";
import {
  computeFunnel,
  computeAdBreakdown,
  type AdsLead,
  type LeadStatus,
} from "../../lib/adsTracker";
import KpiStrip from "../../components/ads-tracker/KpiStrip";
import AdBreakdownTable from "../../components/ads-tracker/AdBreakdownTable";
import LeadTrackerTable from "../../components/ads-tracker/LeadTrackerTable";
import MetaDataTable from "../../components/ads-tracker/MetaDataTable";

type SubTab = "dashboard" | "leads" | "meta";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "leads", label: "Lead Tracker" },
  { id: "meta", label: "Meta Data" },
];

export default function AdminAdsClient() {
  const { clientId } = useParams<{ clientId: string }>();
  const client = getMockAdsClient(clientId ?? "");

  // Leads are editable, so they live in local state seeded from the mock.
  // (Hooks run before the early return; seed from the lookup, empty if missing.)
  const [leads, setLeads] = useState<AdsLead[]>(client?.leads ?? []);
  const [tab, setTab] = useState<SubTab>("dashboard");

  // Recompute the funnel and breakdown from the live (edited) leads.
  const data = useMemo(
    () => (client ? { ...client, leads } : null),
    [client, leads],
  );
  const funnel = useMemo(() => (data ? computeFunnel(data) : null), [data]);
  const breakdown = useMemo(() => (data ? computeAdBreakdown(data) : []), [data]);

  if (!client || !data || !funnel) return <Navigate to="/admin/ads" replace />;

  const setStatus = (index: number, status: LeadStatus) =>
    setLeads((prev) => prev.map((l, i) => (i === index ? { ...l, status } : l)));
  const setValue = (index: number, value: number | null) =>
    setLeads((prev) => prev.map((l, i) => (i === index ? { ...l, value } : l)));

  return (
    <div className="pk-root">
      <PillarStyle />

      <Link className="pk-back" to="/admin/ads">
        <ArrowLeft /> All clients
      </Link>

      <div className="pk-kicker">Paid Ads tracker</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="pk-title">{client.clientName}</span>
      </div>
      <div className="pk-tagline">
        {client.niche ? `${client.niche} · ` : ""}Ad account {client.adAccountId}
      </div>

      <nav className="pk-tabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`pk-tab${t.id === tab ? " on" : ""}`}
          >
            {t.label}
            {t.id === "leads" && <span className="pk-tabcount">{leads.length}</span>}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && (
        <div className="flex flex-col gap-6">
          <KpiStrip funnel={funnel} />
          <div>
            <div className="pk-section-h">Ad breakdown</div>
            <AdBreakdownTable rows={breakdown} />
          </div>
        </div>
      )}

      {tab === "leads" && (
        <LeadTrackerTable leads={leads} onStatusChange={setStatus} onValueChange={setValue} />
      )}

      {tab === "meta" && <MetaDataTable rows={client.metaRows} />}
    </div>
  );
}
