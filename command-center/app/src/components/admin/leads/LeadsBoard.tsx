import { useEffect, useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { countByStatus, totalCount, filterByStatus, type LeadFilter } from "../../../lib/adminLeads";
import type { AdminLeadStatus } from "../../../lib/api";
import { COLD_CALL_STAGES } from "../../../lib/coldCallStages";
import {
  useAdminLeadsQuery,
  useAddAdminLead,
  useUpdateAdminLead,
  useDeleteAdminLead,
} from "../../../hooks/useAdminLeads";
import TileStrip, { type TileSpec } from "./TileStrip";
import LeadsTable from "./LeadsTable";
import LeadsStyle from "./LeadsStyle";
import { STAGE_ICONS } from "./stageIcons";

// Acquisition > Leads: Jake's whole agency lead book as an editable spreadsheet.
// Filter tiles on top, the shared table below, every cell writing straight
// through to /api/admin/tracker/leads. This is the tab body of the Acquisition
// PillarPage, so it renders no header of its own.
//
// The seven filters are the Cold Call Leads pipeline stages, the same vocabulary
// the stage pages use. Nothing is fabricated here: an empty book shows zeros and
// "No leads yet."

export default function LeadsBoard() {
  const [filter, setFilter] = useState<LeadFilter>("All");
  // Focus the first cell of a just-added row, then stand down so a later
  // re-render never steals the cursor back.
  const [justAdded, setJustAdded] = useState(false);

  const leadsQuery = useAdminLeadsQuery();
  const addLead = useAddAdminLead();
  const updateLead = useUpdateAdminLead();
  const deleteLead = useDeleteAdminLead();

  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(false), 1500);
    return () => clearTimeout(t);
  }, [justAdded]);

  const leads = leadsQuery.data?.leads ?? [];
  const counts = countByStatus(leads);
  const total = totalCount(leads);
  const visible = filterByStatus(leads, filter);

  const tiles: TileSpec[] = [
    { key: "All", label: "All Leads", tileClass: "t-all", icon: <LayoutGrid size={15} />, value: total },
    ...COLD_CALL_STAGES.map((stage) => ({
      key: stage.label,
      label: stage.short,
      tileClass: stage.tileClass,
      icon: STAGE_ICONS[stage.id],
      value: counts[stage.label as AdminLeadStatus] ?? 0,
    })),
  ];

  // A new row is always a New Lead, so drop any filter that would hide it.
  const onAdd = () => {
    if (filter !== "All" && filter !== "New Lead") setFilter("All");
    setJustAdded(true);
    addLead.mutate({});
  };

  const title = filter === "All" ? "All Leads" : `${filter} Leads`;

  return (
    <div className="adl">
      <LeadsStyle />

      <div className="adl-controls">
        <button type="button" className="adl-addbtn" onClick={onAdd} disabled={addLead.isPending}>
          <Plus size={16} strokeWidth={2.4} aria-hidden />
          Add lead
        </button>
      </div>

      <TileStrip
        tiles={tiles}
        active={filter}
        ariaLabel="Filter leads by stage"
        onSelect={(key) => setFilter(key === filter && key !== "All" ? "All" : (key as LeadFilter))}
      />

      <LeadsTable
        leads={visible}
        title={title}
        subtitle={`${visible.length} ${visible.length === 1 ? "lead" : "leads"} shown. Click a cell to edit, a header to sort.`}
        emptyText={total === 0 ? "No leads yet." : "No leads in this stage yet."}
        loading={leadsQuery.isPending}
        error={leadsQuery.isError}
        autoFocusFirst={justAdded}
        headerAction={
          filter !== "All" ? (
            <button type="button" className="adl-clearbtn" onClick={() => setFilter("All")}>
              Clear filter
            </button>
          ) : undefined
        }
        onPatch={(id, fields) => updateLead.mutate({ id, ...fields })}
        onDelete={(id) => deleteLead.mutate({ id })}
        onAdd={onAdd}
        addDisabled={addLead.isPending}
      />
    </div>
  );
}
