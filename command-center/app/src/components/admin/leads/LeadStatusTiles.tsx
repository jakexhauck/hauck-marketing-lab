import type { ReactNode } from "react";
import {
  LayoutGrid,
  Plus,
  Phone,
  PhoneOff,
  Calendar,
  Check,
  SquareCheckBig,
  CircleX,
} from "lucide-react";
import type { AdminLeadStatus } from "../../../lib/api";
import { LEAD_STATUSES, STATUS_META, type LeadFilter } from "../../../lib/adminLeads";

// The bento filter strip: All plus the seven statuses, each with its live count.
// Tapping a tile filters the table; tapping the active tile clears back to All.
// Ported from the .tiles block in docs/mockups/admin-redesign/leads-B.html.
// Counts come straight from the list, so an empty book reads 0 everywhere.

const TILE_ICONS: Record<AdminLeadStatus, ReactNode> = {
  New: <Plus size={15} />,
  Contacted: <Phone size={15} />,
  "No Answer": <PhoneOff size={15} />,
  Booked: <Calendar size={15} />,
  Qualified: <Check size={15} />,
  Closed: <SquareCheckBig size={15} />,
  Dead: <CircleX size={15} />,
};

interface LeadStatusTilesProps {
  counts: Record<AdminLeadStatus, number>;
  total: number;
  filter: LeadFilter;
  onFilter: (filter: LeadFilter) => void;
}

export default function LeadStatusTiles({
  counts,
  total,
  filter,
  onFilter,
}: LeadStatusTilesProps) {
  const tiles: { key: LeadFilter; label: string; tileClass: string; icon: ReactNode; value: number }[] = [
    { key: "All", label: "All Leads", tileClass: "t-all", icon: <LayoutGrid size={15} />, value: total },
    ...LEAD_STATUSES.map((status) => ({
      key: status as LeadFilter,
      label: STATUS_META[status].label,
      tileClass: STATUS_META[status].tileClass,
      icon: TILE_ICONS[status],
      value: counts[status],
    })),
  ];

  return (
    <div className="adl-tiles">
      {tiles.map((tile) => {
        const on = filter === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            className={`adl-tile ${tile.tileClass}${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onFilter(on && tile.key !== "All" ? "All" : tile.key)}
          >
            <span className="adl-tiletop">
              <span className="adl-tileico" aria-hidden>
                {tile.icon}
              </span>
              <span className="adl-tilelbl">{tile.label}</span>
            </span>
            <span className="adl-tileval">{tile.value}</span>
          </button>
        );
      })}
    </div>
  );
}
