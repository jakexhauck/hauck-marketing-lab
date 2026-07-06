// command-center/app/src/lib/callConsole.ts
// Pure helpers for the Call Console: caller classification + the outcome->stage
// routing table. Stage/pipeline names match the live GHL template (see
// functions/api/sales/leads/index.ts STAGE_STATUS and sales-call-system.md).

export interface OutcomeDef {
  key: string;
  label: string;
  stageName: string;
  pipelineName?: string; // set when the move crosses into another pipeline
  status?: "open" | "won" | "lost" | "abandoned";
  needsPrice?: boolean;
  needsTime?: boolean;
  needsCallback?: boolean;
}

// Unknown when there is no real name: blank, or the "name" is just the phone
// number GHL falls back to for an unrecognised inbound caller.
export function isUnknownCaller(name: string | undefined, phone: string): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  const digits = (s: string) => s.replace(/\D/g, "");
  return digits(n).length > 0 && digits(n) === digits(phone);
}

export const OUTCOMES: OutcomeDef[] = [
  { key: "booked", label: "Booked the job", stageName: "Job Booked", pipelineName: "Sales Pipeline", needsPrice: true },
  { key: "visit", label: "Book in-person visit", stageName: "Estimate Scheduled", needsTime: true },
  { key: "followup", label: "Follow up later", stageName: "Follow Up", needsCallback: true },
  { key: "no_answer", label: "No answer / voicemail", stageName: "No Answer" },
  { key: "not_qualified", label: "Not qualified", stageName: "", status: "lost" },
];

export function outcomeToStage(key: string): OutcomeDef | undefined {
  return OUTCOMES.find((o) => o.key === key);
}
