// Pure validation for the Ad Library "New creative" form
// (functions/api/admin/clients/[tenantId]/ads/creatives/index.ts POST).
// Kept separate from the handler so the rules (required fields, length caps,
// status enum) are unit-tested without spinning up Supabase or a request.

export type CreativeStatus = "draft" | "approved" | "live";

const STATUSES = new Set<CreativeStatus>(["draft", "approved", "live"]);

const HEADLINE_MAX = 300;
const PRIMARY_TEXT_MAX = 2000;

export interface CreativeInput {
  mediaRef?: string;
  headline: string;
  primaryText: string;
  status: CreativeStatus;
}

export type CreativeValidation =
  | { ok: true; value: CreativeInput }
  | { ok: false; error: string };

// Accepts the raw parsed JSON body and either returns a clean, typed input
// ready to insert, or a short, specific error for a 400 response.
export function validateCreativeInput(body: unknown): CreativeValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid body" };
  }
  const b = body as Record<string, unknown>;

  const headline = typeof b.headline === "string" ? b.headline.trim() : "";
  if (!headline) return { ok: false, error: "headline is required" };
  if (headline.length > HEADLINE_MAX) {
    return { ok: false, error: `headline must be ${HEADLINE_MAX} characters or fewer` };
  }

  const primaryText = typeof b.primaryText === "string" ? b.primaryText.trim() : "";
  if (!primaryText) return { ok: false, error: "primary text is required" };
  if (primaryText.length > PRIMARY_TEXT_MAX) {
    return { ok: false, error: `primary text must be ${PRIMARY_TEXT_MAX} characters or fewer` };
  }

  const rawStatus = typeof b.status === "string" ? b.status : "draft";
  if (!STATUSES.has(rawStatus as CreativeStatus)) {
    return { ok: false, error: "status must be one of draft, approved, live" };
  }
  const status = rawStatus as CreativeStatus;

  const mediaRef = typeof b.mediaRef === "string" ? b.mediaRef.trim() : "";

  return {
    ok: true,
    value: { mediaRef: mediaRef || undefined, headline, primaryText, status },
  };
}
