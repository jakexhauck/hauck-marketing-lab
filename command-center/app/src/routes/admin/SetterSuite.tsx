import { useState } from "react";
import {
  useAdminClientsQuery,
  useSetterPipelinesQuery,
  useSetterLeadsQuery,
} from "../../hooks/useApi";
import { useNow } from "../../context/NowContext";
import SetterBoard from "../../components/admin/setter/SetterBoard";
import SetterCockpit from "../../components/admin/setter/SetterCockpit";
import SetterRateStrip from "../../components/admin/SetterRateStrip";
import type { ApiSetterLead } from "../../lib/api";

// /admin/setter: the Setter Suite. One client's leads worked across every one
// of that client's pipelines, unfiltered (unlike the client-facing app, which
// hides retired/system pipelines and stages). Pipeline tabs across the top,
// the real stage columns underneath, and a docked cockpit (dial logging,
// tags, booking) on the right whenever a card is selected.
export default function SetterSuite() {
  const clientsQuery = useAdminClientsQuery(true);
  const clients = clientsQuery.data?.clients ?? [];

  const [tenantId, setTenantId] = useState<string | null>(null);
  const activeTenantId = tenantId ?? clients[0]?.id ?? null;
  const activeClient = clients.find((c) => c.id === activeTenantId) ?? null;

  const pipelinesQuery = useSetterPipelinesQuery(activeTenantId ?? "", !!activeTenantId);
  const pipelines = pipelinesQuery.data?.pipelines ?? [];

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const activePipelineId = pipelineId ?? pipelines[0]?.id ?? null;
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const leadsQuery = useSetterLeadsQuery(
    activeTenantId ?? "",
    activePipelineId ?? "",
    !!activeTenantId && !!activePipelineId,
  );

  const [selectedLead, setSelectedLead] = useState<ApiSetterLead | null>(null);
  const now = useNow();

  const selectClient = (id: string) => {
    setTenantId(id);
    setPipelineId(null);
    setSelectedLead(null);
  };

  const selectPipeline = (id: string) => {
    setPipelineId(id);
    setSelectedLead(null);
  };

  const selectLead = (lead: ApiSetterLead) => {
    setSelectedLead((prev) => (prev?.id === lead.id ? null : lead));
  };

  const closeCockpit = () => setSelectedLead(null);

  return (
    <div className="pk-root">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pk-kicker">Sales / Setter Suite</div>
          <h1 className="pk-title">Setter Suite</h1>
          <p className="pk-tagline">
            Work one client&apos;s leads across every pipeline, live from the booking system.
          </p>
        </div>

        {clients.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Client
            <select
              className="pk-select"
              value={activeTenantId ?? ""}
              onChange={(e) => selectClient(e.target.value)}
              aria-label="Client"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {clientsQuery.isLoading ? (
        <div className="pk-empty">Loading clients...</div>
      ) : clientsQuery.isError ? (
        <div className="pk-empty">Could not load clients.</div>
      ) : clients.length === 0 ? (
        <div className="pk-empty">No clients yet.</div>
      ) : !activeTenantId || !activeClient ? null : (
        <>
          <SetterRateStrip
            leads={leadsQuery.data?.leads ?? []}
            status={leadsQuery.isLoading ? "loading" : leadsQuery.isError ? "failed" : "ready"}
          />

          <nav className="pk-tabs" aria-label="Pipelines">
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pk-tab${p.id === activePipelineId ? " on" : ""}`}
                onClick={() => selectPipeline(p.id)}
              >
                {p.name}
              </button>
            ))}
          </nav>

          {pipelinesQuery.isLoading ? (
            <div className="pk-empty">Loading pipelines...</div>
          ) : pipelinesQuery.isError ? (
            <div className="pk-empty">Could not load pipelines for {activeClient.name}.</div>
          ) : !activePipeline ? (
            <div className="pk-empty">No pipelines found for {activeClient.name}.</div>
          ) : leadsQuery.isLoading ? (
            <div className="pk-empty">Loading leads...</div>
          ) : leadsQuery.isError ? (
            <div className="pk-empty">Could not load leads for {activePipeline.name}.</div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <SetterBoard
                  pipeline={activePipeline}
                  leads={leadsQuery.data?.leads ?? []}
                  truncated={leadsQuery.data?.truncated ?? false}
                  now={now}
                  selectedLeadId={selectedLead?.id ?? null}
                  onSelectLead={selectLead}
                />
              </div>
              {selectedLead && activeTenantId && (
                <SetterCockpit
                  key={selectedLead.id}
                  tenantId={activeTenantId}
                  pipelineId={activePipelineId ?? ""}
                  pipelineName={activePipeline.name}
                  lead={selectedLead}
                  onClose={closeCockpit}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
