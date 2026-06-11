import clsx from "clsx";
import type { Lead } from "../types";
import { leadStageColor, leadStageLabel } from "../lib/stageColors";
import { useClient } from "../context/ClientContext";

interface Props {
  lead: Lead;
  className?: string;
}

export default function StagePill({ lead, className }: Props) {
  const { client } = useClient();
  const c = leadStageColor(lead);
  const label = leadStageLabel(lead, client.pipeline.wonLabel);
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-wider",
        c.bg,
        c.fg,
        className
      )}
    >
      {label}
    </span>
  );
}
