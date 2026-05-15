import type { Lead } from "../types";
import StagePill from "./StagePill";
import { timeAgo } from "../lib/timeAgo";

interface Props {
  lead: Lead;
  onTap: (leadId: string) => void;
}

export default function LeadRow({ lead, onTap }: Props) {
  return (
    <button
      type="button"
      onClick={() => onTap(lead.id)}
      className="flex w-full items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 text-left transition-colors active:bg-slate-50"
      style={{ minHeight: "68px" }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{lead.name}</div>
        <div className="truncate text-xs text-slate-500">{lead.sourceAd}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StagePill stage={lead.stage} />
        <span className="text-xs text-slate-400">{timeAgo(lead.lastActivityAt)}</span>
      </div>
    </button>
  );
}
