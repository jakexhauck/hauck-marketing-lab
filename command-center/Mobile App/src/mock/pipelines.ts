import type { ApiPipelineSummary } from "../lib/api";

// One mock pipeline per demo client, shaped exactly like /api/pipelines
// output so showroom/mock mode runs through the same real-stage model.
const PIPELINES: Record<string, ApiPipelineSummary> = {
  "smiths-roofing": {
    id: "smiths-roofing-p-1",
    name: "Roofing Sales Pipeline",
    stages: [
      { id: "smiths-roofing-s-0", name: "New Lead" },
      { id: "smiths-roofing-s-1", name: "Contacted" },
      { id: "smiths-roofing-s-2", name: "Estimate Sent" },
      { id: "smiths-roofing-s-3", name: "Job Scheduled" },
    ],
  },
  "glow-medspa": {
    id: "glow-medspa-p-1",
    name: "Med Spa Pipeline",
    stages: [
      { id: "glow-medspa-s-0", name: "New Lead" },
      { id: "glow-medspa-s-1", name: "Contacted" },
      { id: "glow-medspa-s-2", name: "Consultation Scheduled" },
      { id: "glow-medspa-s-3", name: "Treatment Booked" },
    ],
  },
  "apex-detailing": {
    id: "apex-detailing-p-1",
    name: "Detailing Pipeline",
    stages: [
      { id: "apex-detailing-s-0", name: "New Lead" },
      { id: "apex-detailing-s-1", name: "Contacted" },
      { id: "apex-detailing-s-2", name: "Appointment Set" },
    ],
  },
};

export function getMockPipelinesForClient(
  clientId: string,
): ApiPipelineSummary[] {
  const p = PIPELINES[clientId];
  return p ? [p] : [];
}
