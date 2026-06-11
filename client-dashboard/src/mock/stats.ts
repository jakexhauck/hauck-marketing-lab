import type { Lead, Stats } from "../types";

export function computeStats(leads: Lead[], spendMtd: number): Stats {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const mtd = leads.filter((l) => new Date(l.createdAt).getTime() >= monthStart);
  const wonLeads = mtd.filter((l) => l.status === "won");
  const progressed = mtd.filter(
    (l) => l.status === "won" || (l.status === "open" && l.stagePosition > 0),
  );
  const fresh = mtd.filter(
    (l) => l.status === "open" && l.stagePosition === 0,
  );

  const revenueMtd = wonLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const wonMtd = wonLeads.length;
  const cpa = wonMtd > 0 ? spendMtd / wonMtd : null;
  const roas = spendMtd > 0 ? revenueMtd / spendMtd : null;

  return {
    leadsMtd: mtd.length,
    progressedMtd: progressed.length,
    newMtd: fresh.length,
    wonMtd,
    revenueMtd,
    spendMtd,
    cpa,
    roas,
  };
}
