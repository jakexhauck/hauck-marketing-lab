import type { Lead } from "../types";
import StagePill from "./StagePill";
import Avatar from "./Avatar";
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
      className="flex w-full items-center gap-3 border-b border-slate-100 bg-white px-4 py-3.5 text-left transition-transform active:scale-[0.98] active:bg-slate-50"
      style={{ minHeight: "64px" }}
    >
      <Avatar name={lead.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-slate-900">
          {lead.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{lead.sourceAd}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StagePill stage={lead.stage} />
        <span className="tabular-figs text-[10.5px] font-semibold text-slate-400">
          {timeAgo(lead.lastActivityAt)}
        </span>
      </div>
    </button>
  );
}
