import { useSearchParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import {
  COLD_CALL_STAGES,
  TRACKER_ID,
  resolveStageId,
  stageById,
} from "../../../lib/coldCallStages";
import { countByStatus, filterByStatus } from "../../../lib/adminLeads";
import type { AdminLeadStatus } from "../../../lib/api";
import {
  useAdminLeadsQuery,
  useAddAdminLead,
  useUpdateAdminLead,
  useDeleteAdminLead,
} from "../../../hooks/useAdminLeads";
import { COLD_CALL_DEMO_LEADS } from "../../../demo/coldCallDemoLeads";
import TileStrip, { type TileSpec } from "../leads/TileStrip";
import LeadsTable from "../leads/LeadsTable";
import LeadsStyle from "../leads/LeadsStyle";
import { STAGE_ICONS } from "../leads/stageIcons";
import ColdCallTracker from "./ColdCallTracker";

// Acquisition > Cold Calling: one page per stage of the Cold Call Leads pipeline
// in the agency GHL sub-account, plus the hand-typed daily Tracker at the end of
// the strip.
//
// Every stage page is the same page: the strip, a stage header, and the shared
// lead table filtered to that stage. The active stage lives in ?stage= so a page
// is linkable and survives a reload.
//
// Until the lead book has real rows, the pages render a demo set behind a visible
// badge and every cell is read-only, so nothing fabricated can be mistaken for a
// real lead or written anywhere. The demo set disappears the moment a real lead
// exists.

export default function ColdCallSurface() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = resolveStageId(searchParams.get("stage"));

  const leadsQuery = useAdminLeadsQuery();
  const addLead = useAddAdminLead();
  const updateLead = useUpdateAdminLead();
  const deleteLead = useDeleteAdminLead();

  const realLeads = leadsQuery.data?.leads ?? [];
  // Only stand in for an empty book, and only once the book has actually
  // answered: a slow request must not flash demo rows.
  const isDemo = !leadsQuery.isPending && !leadsQuery.isError && realLeads.length === 0;
  const leads = isDemo ? COLD_CALL_DEMO_LEADS : realLeads;
  const counts = countByStatus(leads);

  const setStage = (stage: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("stage", stage);
        return next;
      },
      { replace: true },
    );
  };

  const tiles: TileSpec[] = [
    ...COLD_CALL_STAGES.map((stage) => ({
      key: stage.id,
      label: stage.short,
      tileClass: stage.tileClass,
      icon: STAGE_ICONS[stage.id],
      value: counts[stage.label as AdminLeadStatus] ?? 0,
    })),
    {
      key: TRACKER_ID,
      label: "Tracker",
      tileClass: "t-tracker",
      icon: STAGE_ICONS[TRACKER_ID],
      // The tracker counts dialing days, not leads: a number here would be a
      // different unit sitting in the same row.
      value: undefined,
    },
  ];

  const stage = page === TRACKER_ID ? null : stageById(page);
  const stageLeads = stage ? filterByStatus(leads, stage.label as AdminLeadStatus) : [];

  return (
    <div className="adl">
      <LeadsStyle />

      <TileStrip
        tiles={tiles}
        active={page}
        ariaLabel="Cold Call pipeline stages"
        onSelect={setStage}
      />

      {stage ? (
        <>
          <div className="ccs-head">
            <div>
              <div className="ccs-stage">
                <span className="ccs-dot" style={{ background: stage.swatch }} aria-hidden />
                <h2 className="ccs-name">{stage.label}</h2>
              </div>
              <p className="ccs-meaning">{stage.meaning}</p>
              {stage.tag && (
                <p className="ccs-tag">
                  GoHighLevel moves a lead here on <code>{stage.tag}</code>
                </p>
              )}
            </div>

            {isDemo && (
              <span className="ccs-badge">
                <FlaskConical size={14} strokeWidth={2.4} aria-hidden />
                Demo data, not real leads
              </span>
            )}
          </div>

          <LeadsTable
            leads={stageLeads}
            title={stage.label}
            subtitle={
              isDemo
                ? `${stageLeads.length} demo ${stageLeads.length === 1 ? "lead" : "leads"}. Read-only until real leads land.`
                : `${stageLeads.length} ${stageLeads.length === 1 ? "lead" : "leads"} in this stage. Click a cell to edit, a header to sort.`
            }
            emptyText="No leads in this stage."
            loading={leadsQuery.isPending}
            error={leadsQuery.isError}
            readOnly={isDemo}
            onPatch={(id, fields) => updateLead.mutate({ id, ...fields })}
            onDelete={(id) => deleteLead.mutate({ id })}
            onAdd={() => addLead.mutate({})}
            addDisabled={addLead.isPending}
          />
        </>
      ) : (
        <div className="ccs-tracker">
          <ColdCallTracker />
        </div>
      )}
    </div>
  );
}
