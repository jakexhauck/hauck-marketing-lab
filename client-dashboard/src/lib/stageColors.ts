import type { LeadStage } from "../types";

export interface StageColor {
  bg: string;
  fg: string;
  ring: string;
}

export const stageColors: Record<LeadStage, StageColor> = {
  new: {
    bg: "bg-slate-700",
    fg: "text-white",
    ring: "ring-slate-800",
  },
  contacted: {
    bg: "bg-indigo-600",
    fg: "text-white",
    ring: "ring-indigo-700",
  },
  "estimate-sent": {
    bg: "bg-violet-600",
    fg: "text-white",
    ring: "ring-violet-700",
  },
  consultation: {
    bg: "bg-fuchsia-600",
    fg: "text-white",
    ring: "ring-fuchsia-700",
  },
  booked: {
    bg: "bg-amber-500",
    fg: "text-white",
    ring: "ring-amber-600",
  },
  won: {
    bg: "bg-emerald-600",
    fg: "text-white",
    ring: "ring-emerald-700",
  },
  lost: {
    bg: "bg-rose-600",
    fg: "text-white",
    ring: "ring-rose-700",
  },
  "no-show": {
    bg: "bg-slate-500",
    fg: "text-white",
    ring: "ring-slate-600",
  },
};

export const stageLabels: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  "estimate-sent": "Estimate Sent",
  consultation: "Consultation",
  booked: "Booked",
  won: "Won",
  lost: "Lost",
  "no-show": "No-Show",
};
