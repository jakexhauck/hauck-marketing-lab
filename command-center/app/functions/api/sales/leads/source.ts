export type LeadSource = "ad" | "form" | "chat";

// Classify a GHL opportunity's `source` string into the client-facing channel.
// Chat wins first (a chat lead could also carry a site name); then paid signals;
// everything else is a form submission. NOTE: the paid-signal list is tuned to
// the known Meta stamps and MUST be re-verified against real ad leads once they
// flow (the test account currently only has Chat Widget leads).
const PAID = ["facebook", "instagram", "meta", "paid", " ad", "lead ad", "fb", "ig"];

export function classifySource(rawSource: string | null | undefined): LeadSource {
  const s = (rawSource ?? "").toLowerCase();
  if (s.includes("chat")) return "chat";
  if (PAID.some((p) => s.includes(p))) return "ad";
  return "form";
}
