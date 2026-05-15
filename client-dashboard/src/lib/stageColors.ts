import type { LeadStage } from "../types";

export interface StageColor {
  bg: string;
  fg: string;
  ring: string;
}

export const stageColors: Record<LeadStage, StageColor> = {
  new: {
    bg: "bg-slate-100",
    fg: "text-slate-700",
    ring: "ring-slate-200",
  },
  contacted: {
    bg: "bg-blue-100",
    fg: "text-blue-700",
    ring: "ring-blue-200",
  },
  "estimate-sent": {
    bg: "bg-indigo-100",
    fg: "text-indigo-700",
    ring: "ring-indigo-200",
  },
  consultation: {
    bg: "bg-indigo-100",
    fg: "text-indigo-700",
    ring: "ring-indigo-200",
  },
  booked: {
    bg: "bg-amber-100",
    fg: "text-amber-700",
    ring: "ring-amber-200",
  },
  won: {
    bg: "bg-emerald-100",
    fg: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  lost: {
    bg: "bg-red-100",
    fg: "text-red-700",
    ring: "ring-red-200",
  },
  "no-show": {
    bg: "bg-slate-200",
    fg: "text-slate-600",
    ring: "ring-slate-300",
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
