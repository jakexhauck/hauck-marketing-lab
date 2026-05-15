import clsx from "clsx";
import type { LeadStage } from "../types";
import { stageLabels } from "../lib/stageColors";

export type StageFilterValue = "all" | LeadStage;

interface Props {
  active: StageFilterValue;
  counts: Record<StageFilterValue, number>;
  onChange: (value: StageFilterValue) => void;
}

const FILTER_STAGES: StageFilterValue[] = [
  "all",
  "new",
  "contacted",
  "booked",
  "won",
  "lost",
  "no-show",
];

const LABELS: Record<StageFilterValue, string> = {
  all: "All",
  new: stageLabels.new,
  contacted: stageLabels.contacted,
  "estimate-sent": stageLabels["estimate-sent"],
  consultation: stageLabels.consultation,
  booked: stageLabels.booked,
  won: stageLabels.won,
  lost: stageLabels.lost,
  "no-show": stageLabels["no-show"],
};

export default function StageFilter({ active, counts, onChange }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white px-4 py-2"
      style={{ scrollbarWidth: "none" }}
    >
      {FILTER_STAGES.map((stage) => {
        const isActive = stage === active;
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onChange(stage)}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              isActive
                ? "text-white"
                : "bg-slate-100 text-slate-700 active:bg-slate-200"
            )}
            style={
              isActive
                ? { backgroundColor: "var(--brand-primary)" }
                : undefined
            }
          >
            {LABELS[stage]} {counts[stage]}
          </button>
        );
      })}
    </div>
  );
}
