export interface ProjectionInputs {
  spend: number;
  cpl: number;
  closeRate: number; // 0..1
  avgJobValue: number;
}

export interface ProjectionOutputs {
  leads: number;
  jobs: number;
  revenue: number;
  roas: number | null;
}

export function computeProjection(inputs: ProjectionInputs): ProjectionOutputs {
  const { spend, cpl, closeRate, avgJobValue } = inputs;
  const leads = cpl > 0 ? spend / cpl : 0;
  const jobs = leads * closeRate;
  const revenue = jobs * avgJobValue;
  const roas = spend > 0 ? revenue / spend : null;
  return { leads, jobs, revenue, roas };
}

export function pctDelta(next: number, base: number): number {
  if (base === 0) return next === 0 ? 0 : 1;
  return (next - base) / base;
}
