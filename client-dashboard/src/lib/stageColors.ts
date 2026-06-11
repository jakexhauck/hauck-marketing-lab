import type { Lead } from "../types";

export interface StageColor {
  bg: string;
  fg: string;
  ring: string;
}

// Colors key off a stage's position within its own pipeline, never off its
// name. The palette cycles for pipelines with more stages than entries.
const POSITION_PALETTE: StageColor[] = [
  { bg: "bg-slate-700", fg: "text-white", ring: "ring-slate-800" },
  { bg: "bg-indigo-600", fg: "text-white", ring: "ring-indigo-700" },
  { bg: "bg-violet-600", fg: "text-white", ring: "ring-violet-700" },
  { bg: "bg-fuchsia-600", fg: "text-white", ring: "ring-fuchsia-700" },
  { bg: "bg-amber-500", fg: "text-white", ring: "ring-amber-600" },
  { bg: "bg-sky-600", fg: "text-white", ring: "ring-sky-700" },
  { bg: "bg-teal-600", fg: "text-white", ring: "ring-teal-700" },
];

const UNKNOWN_STAGE_COLOR: StageColor = {
  bg: "bg-slate-400",
  fg: "text-white",
  ring: "ring-slate-500",
};

export const statusColors: Record<"won" | "lost" | "abandoned", StageColor> = {
  won: { bg: "bg-emerald-600", fg: "text-white", ring: "ring-emerald-700" },
  lost: { bg: "bg-rose-600", fg: "text-white", ring: "ring-rose-700" },
  abandoned: { bg: "bg-slate-500", fg: "text-white", ring: "ring-slate-600" },
};

export function stageColorForPosition(position: number): StageColor {
  if (position < 0) return UNKNOWN_STAGE_COLOR;
  return POSITION_PALETTE[position % POSITION_PALETTE.length];
}

// One place decides how a lead's stage/status reads on screen: terminal
// statuses win, otherwise the lead's real GHL stage name.
export function leadStageLabel(lead: Lead, wonLabel = "Won"): string {
  if (lead.status === "won") return wonLabel;
  if (lead.status === "lost") return "Lost";
  if (lead.status === "abandoned") return "Abandoned";
  return lead.stageName || "Unknown stage";
}

export function leadStageColor(lead: Lead): StageColor {
  if (lead.status === "won" || lead.status === "lost" || lead.status === "abandoned") {
    return statusColors[lead.status];
  }
  return stageColorForPosition(lead.stagePosition);
}
