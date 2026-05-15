import type { Lead, Stats } from "../types";

export function computeStats(leads: Lead[], spendMtd: number): Stats {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const mtd = leads.filter((l) => new Date(l.createdAt).getTime() >= monthStart);
  const wonLeads = mtd.filter((l) => l.stage === "won");
  const bookedLeads = mtd.filter((l) => l.stage === "booked" || l.stage === "won");

  const revenueMtd = wonLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const wonMtd = wonLeads.length;
  const cpa = wonMtd > 0 ? spendMtd / wonMtd : null;
  const roas = spendMtd > 0 ? revenueMtd / spendMtd : null;

  return {
    leadsMtd: mtd.length,
    bookedMtd: bookedLeads.length,
    wonMtd,
    revenueMtd,
    spendMtd,
    cpa,
    roas,
  };
}
