// Client > Launch KPIs (Jake, 2026-10-23): the agency's ROI Calculator Google
// Sheet as a page. Three inputs per client, fixed best / average / worst
// benchmarks (the sheet's "DO NOT TOUCH" block), and the projected funnel for
// each scenario.
//
// One deliberate difference from the sheet: there, Revenue multiplies the
// FRACTIONAL clients signed (11.25) while Profit multiplies the rounded number
// (11), so the two rows disagree with each other. Here both use whole clients,
// because a client is signed or not. Profit and ROI match the sheet exactly.

export interface RoiInputs {
  adSpend: number; // 30 days
  jobSize: number; // median client / job size
  margin: number; // 0..1
}

export interface RoiBenchmark {
  id: "best" | "average" | "worst";
  label: string;
  cpl: number;
  cpa: number;
  closeRate: number; // 0..1
}

export const ROI_BENCHMARKS: RoiBenchmark[] = [
  { id: "best", label: "Best Case", cpl: 20, cpa: 100, closeRate: 0.75 },
  { id: "average", label: "Average Case", cpl: 30, cpa: 200, closeRate: 0.7 },
  { id: "worst", label: "Worst Case", cpl: 50, cpa: 300, closeRate: 0.5 },
];

export const ROI_DEFAULTS: RoiInputs = { adSpend: 1500, jobSize: 15000, margin: 0.25 };

export interface RoiRow {
  id: RoiBenchmark["id"];
  label: string;
  leads: number;
  appointments: number;
  clients: number;
  revenue: number;
  profit: number;
  // Profit per dollar of ad spend (27.5 = 27.5x). Null with no spend.
  roi: number | null;
}

export function averageProfit(i: RoiInputs): number {
  return i.jobSize * i.margin;
}

export function roiRows(i: RoiInputs, benchmarks: RoiBenchmark[] = ROI_BENCHMARKS): RoiRow[] {
  const perJob = averageProfit(i);
  return benchmarks.map((b) => {
    const appointments = i.adSpend / b.cpa;
    const clients = Math.round(appointments * b.closeRate);
    const profit = clients * perJob;
    return {
      id: b.id,
      label: b.label,
      leads: Math.round(i.adSpend / b.cpl),
      appointments: Math.round(appointments),
      clients,
      revenue: clients * i.jobSize,
      profit,
      roi: i.adSpend > 0 ? profit / i.adSpend : null,
    };
  });
}
