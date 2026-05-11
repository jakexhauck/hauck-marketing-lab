// Type-only scaffolding for the Main Dashboard. No fake data lives here —
// real clients flow in from disk, and dashboard widgets render "no data"
// states until they have data sources wired up.

export type ClientStatus = "live" | "hold";

export interface ClientCounts {
  contract?: string;
  resources?: string;
  campaigns?: string;
  invoicesDue?: string;
}

export interface ClientV1 {
  slug: string;
  name: string;
  status: ClientStatus;
  counts: ClientCounts;
}

export type CallState = "done" | "live" | "open";
