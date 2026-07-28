// Which client the Fulfillment pages are looking at.
//
// The pick follows you: choose Willis on Paid Ads and Billing, Config and the
// rest are already on Willis, through a reload too. That is two stores working
// together, and this file is the pure resolution between them, kept out of
// React so every rung of the ladder is testable.
//
//   1. ?client= on the URL    - exact, and makes a pasted link open the same
//                               thing for whoever opens it.
//   2. localStorage           - what you last picked, so a fresh sidebar click
//                               (which carries no param) lands where you left.
//   3. the first client       - a sensible default on a first ever visit.
//   4. none                   - no clients exist yet. The page says so rather
//                               than rendering a client-shaped blank.
//
// A stored id is validated against the live list, so a client that has since
// been removed falls through to the first rather than pinning every page to a
// 404.

export const SELECTED_CLIENT_KEY = "hml.admin.fulfillmentClient";

export type SelectedClientSource = "url" | "stored" | "first" | "none";

export interface SelectedClientInput {
  urlParam: string | null | undefined;
  stored: string | null | undefined;
  // Only the id is needed to resolve; callers pass their full client objects.
  clients: readonly { id: string }[];
}

export interface SelectedClientResult {
  tenantId: string | null;
  source: SelectedClientSource;
}

export function resolveSelectedClient({
  urlParam,
  stored,
  clients,
}: SelectedClientInput): SelectedClientResult {
  const has = (id: string | null | undefined): id is string =>
    !!id && clients.some((c) => c.id === id);

  if (has(urlParam)) return { tenantId: urlParam, source: "url" };
  if (has(stored)) return { tenantId: stored, source: "stored" };
  if (clients.length > 0) return { tenantId: clients[0].id, source: "first" };
  return { tenantId: null, source: "none" };
}

// localStorage access, guarded: a browser with storage disabled should cost the
// admin a remembered pick, not a blank page.
export function readStoredClient(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_CLIENT_KEY);
  } catch {
    return null;
  }
}

export function writeStoredClient(tenantId: string): void {
  try {
    window.localStorage.setItem(SELECTED_CLIENT_KEY, tenantId);
  } catch {
    // Ignore: the URL still carries the pick for this session.
  }
}
