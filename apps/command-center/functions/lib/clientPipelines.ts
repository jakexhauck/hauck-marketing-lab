// Which of a location's pipelines the CLIENT is allowed to see.
//
// The agency runs its own outbound board ("Cold Calling") inside the same
// GoHighLevel location it uses for client work. That board is Hauck Marketing's
// prospecting, not the client's business, and a client opening their dashboard
// must never be shown it.
//
// Matched by name rather than by id, because ids are per-location and this has
// to hold for the next client without a remap. Name matching is the weaker tool
// (see adTrackerMetrics.ts, where a pipeline rename silently zeroed a metric for
// two days), but the failure mode here is the mild one: an agency board briefly
// reappearing on a dashboard, or a client board named "cold call" being hidden.
// Neither corrupts a number. Getting it wrong the other way, leaking the
// agency's prospect list into a client's account, is the one that matters.
//
// Deliberately NOT applied to /api/pipelines: that endpoint is the frontend's
// only source of stage names, and filtering it would leave any lead sitting on
// a hidden board rendering with an unresolved stage.

const AGENCY_ONLY = ["cold call", "cold calling", "coldcall"];

export function isAgencyPipeline(name: string | null | undefined): boolean {
  const key = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return false;
  return AGENCY_ONLY.some((needle) => key.includes(needle));
}

// Drop the agency's own boards from a client-facing pipeline list.
export function clientVisiblePipelines<T extends { name: string }>(
  pipelines: T[],
): T[] {
  return pipelines.filter((p) => !isAgencyPipeline(p.name));
}
