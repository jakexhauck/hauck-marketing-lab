// Close-out: shared client types.
//
// Mirrors functions/lib/closeOut.ts. The rules live on the server (the page can
// only ever ask); these are the shapes the request and the prefill travel in.

export type CustomerType = "one-time" | "recurring";

export type NextServiceMode = "book" | "unplanned" | "none";

export type NextServiceChoice =
  | { mode: "book"; at: string }
  | { mode: "unplanned" }
  | { mode: "none" };

export interface CloseOutPrefill {
  opportunityId: string;
  contactId: string;
  name: string;
  phone: string;
  email: string;
  valueCents: number;
  existingCustomer: { type: CustomerType; stageName: string } | null;
  alreadyClosedOut: boolean;
  configError?: "pipeline_not_found";
}

export interface CloseOutRequest {
  opportunityId: string;
  type: CustomerType;
  description: string;
  valueCents: number;
  completedOn: string;
  nextService: NextServiceChoice;
}

export interface CloseOutSuccess {
  ok: true;
  contactId: string;
  // The job and the move landed; only the calendar booking failed. The page
  // keeps the success and names the reason.
  appointmentError?: string;
}

export interface CloseOutCountResponse {
  count: number;
  opportunityIds: string[];
  unavailable?: boolean;
}

// No DEMO_* fixture for the close-out queue on purpose: both the count and the
// prefill are derived from the demo store's own leads in
// src/demo/handlers/closeOuts.ts, so the badge always lands on the cards the
// board is actually showing in Job Completed.
