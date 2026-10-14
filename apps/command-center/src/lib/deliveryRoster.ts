import type { AdminClient } from "./api";

// Pure helpers for the Service Delivery roster rail. Kept out of the component
// so the search logic is independently testable without React or a network
// mock.

export function matchesRosterSearch(
  client: Pick<AdminClient, "name" | "niche">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) || (client.niche || "").toLowerCase().includes(q)
  );
}

export function filterRoster(clients: AdminClient[], query: string): AdminClient[] {
  return clients.filter((c) => matchesRosterSearch(c, query));
}
