import type { LeadStage } from "../types";

export function mapGhlStage(
  stageName: string | undefined,
  ghlStatus: string | undefined,
): LeadStage {
  const status = (ghlStatus ?? "").toLowerCase();
  if (status === "won") return "won";
  if (status === "lost" || status === "abandoned") return "lost";

  const n = (stageName ?? "").toLowerCase();
  if (n.includes("no show") || n.includes("no-show")) return "no-show";
  if (n.includes("book") || n.includes("paid")) return "booked";
  if (n.includes("consult") || n.includes("appointment") || n.includes("schedul"))
    return "consultation";
  if (
    n.includes("estimate") ||
    n.includes("quote") ||
    n.includes("proposal") ||
    n.includes("offer")
  )
    return "estimate-sent";
  if (n.includes("contact") || n.includes("reached") || n.includes("follow"))
    return "contacted";
  return "new";
}

export function reverseMapStage(
  appStage: LeadStage,
  pipelineStages: { id: string; name: string }[],
): string | null {
  const candidates: Record<LeadStage, string[]> = {
    new: ["new", "lead"],
    contacted: ["contacted", "reached", "follow"],
    "estimate-sent": ["estimate", "quote", "proposal", "offer"],
    consultation: ["consult", "appointment", "schedul"],
    booked: ["book", "paid"],
    won: ["won", "closed", "paid"],
    lost: ["lost", "abandon"],
    "no-show": ["no show", "no-show"],
  };
  const needles = candidates[appStage] ?? [];
  for (const stage of pipelineStages) {
    const lower = stage.name.toLowerCase();
    if (needles.some((needle) => lower.includes(needle))) return stage.id;
  }
  return null;
}
