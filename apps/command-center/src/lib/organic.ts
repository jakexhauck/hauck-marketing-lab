// Organic leads: what the client's own website produced, as opposed to what the
// ads produced. Backed by ONE GHL pipeline named "Organic", whose stages are the
// page's columns (live Willis: "Chat Widget" and "Estimate Form").
//
// The client never works these leads in the app: they reply by phone. The page
// is therefore a read surface, and the detail view answers the only question
// worth asking, which is what the lead actually said.
//
// Server contract: functions/api/organic/index.ts and [contactId].ts.

export type OrganicChannel = "form" | "chat" | "other";

export interface OrganicLead {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  stageName: string;
  channel: OrganicChannel;
}

export interface OrganicMessage {
  id: string;
  body: string;
  direction: string;
  at: string;
}

export interface OrganicAnswer {
  label: string;
  value: string;
}

export interface OrganicDetail {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  landingUrl: string;
  sessionSource: string;
  createdAt: string;
  messages: OrganicMessage[];
  answers: OrganicAnswer[];
  answersUnavailable: boolean;
}

export interface OrganicDataset {
  available: boolean;
  stages: string[];
  leads: OrganicLead[];
}

// A lead is "new" for its first 24 hours. There is no worked/unworked flag to
// read: the Organic pipeline has one stage per CHANNEL, not per status, and
// nothing moves a card once the automation drops it in. Age is the only honest
// signal on the list, so the badge means recent, and says so.
const NEW_WINDOW_MS = 24 * 60 * 60_000;

export function isNewOrganic(lead: OrganicLead, now: number = Date.now()): boolean {
  const at = new Date(lead.createdAt).getTime();
  if (Number.isNaN(at)) return false;
  return now - at < NEW_WINDOW_MS;
}

// Strip the scheme and host so a landing page reads as "/windows-quote" rather
// than as a URL the client has to parse. Query strings go too: GHL appends its
// own click ids, which are noise to a business owner.
export function landingPath(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}

export function organicColumns(leads: OrganicLead[]): Record<OrganicChannel, OrganicLead[]> {
  return {
    form: leads.filter((l) => l.channel === "form"),
    chat: leads.filter((l) => l.channel === "chat"),
    other: leads.filter((l) => l.channel === "other"),
  };
}
