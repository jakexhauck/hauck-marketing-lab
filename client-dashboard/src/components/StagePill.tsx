import clsx from "clsx";
import type { LeadStage } from "../types";
import { stageColors, stageLabels } from "../lib/stageColors";

interface Props {
  stage: LeadStage;
  className?: string;
}

export default function StagePill({ stage, className }: Props) {
  const c = stageColors[stage];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        c.bg,
        c.fg,
        className
      )}
    >
      {stageLabels[stage]}
    </span>
  );
}
