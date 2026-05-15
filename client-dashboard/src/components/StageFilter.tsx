import clsx from "clsx";
import type { LeadStage } from "../types";
import { stageLabels } from "../lib/stageColors";
import { useClient } from "../context/ClientContext";

export type StageFilterValue = "all" | LeadStage;

interface Props {
  active: StageFilterValue;
  counts: Record<StageFilterValue, number>;
  onChange: (value: StageFilterValue) => void;
}

export default function StageFilter({ active, counts, onChange }: Props) {
  const { client } = useClient();

  const chips: StageFilterValue[] = ["all", ...client.pipeline.stages];

  const labelFor = (stage: StageFilterValue): string => {
    if (stage === "all") return "All";
    if (stage === "won") return client.pipeline.wonLabel;
    return stageLabels[stage];
  };

  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto bg-slate-50 px-5 pb-3 pt-1"
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((stage) => {
        const isActive = stage === active;
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onChange(stage)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-[0.97]",
              isActive
                ? "text-white"
                : "border border-slate-200 bg-white text-slate-700"
            )}
            style={
              isActive
                ? { backgroundColor: "var(--brand-primary)" }
                : undefined
            }
          >
            <span>{labelFor(stage)}</span>
            <span
              className={clsx(
                "tabular-figs font-bold",
                isActive ? "text-white/80" : "text-slate-400"
              )}
            >
              {counts[stage]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
