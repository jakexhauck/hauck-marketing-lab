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
      className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white px-4 py-2"
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
            {labelFor(stage)} {counts[stage]}
          </button>
        );
      })}
    </div>
  );
}
