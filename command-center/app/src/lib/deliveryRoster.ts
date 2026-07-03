import type { AdminClient } from "./api";

// Pure helpers for the Service Delivery roster rail (Task 3.1) and the
// delivery overview's "at-risk accounts" panel. Kept out of the components so
// the search/filter/health logic is independently testable without React or
// a network mock.

type HealthStatus = AdminClient["healthStatus"];

export type RosterFilter = "all" | "attention" | "healthy" | "paused";

export const ROSTER_FILTERS: { id: RosterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "healthy", label: "Healthy" },
  { id: "paused", label: "Paused" },
];

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warn: "Needs attention",
  paused: "Paused",
};

export function healthLabel(status: HealthStatus): string {
  return HEALTH_LABEL[status];
}

const HEALTH_DOT_CLASS: Record<HealthStatus, string> = {
  healthy: "pk-roster-dot-healthy",
  warn: "pk-roster-dot-warn",
  paused: "pk-roster-dot-paused",
};

// Maps a tenant's health to the roster-dot CSS class (pure so the color
// mapping is testable without mounting the component).
export function healthDotClass(status: HealthStatus): string {
  return HEALTH_DOT_CLASS[status];
}

// "At risk" = anything other than a clean 'healthy' read: needs a human to
// look, whether that is a warning or a paused account.
export function isAtRisk(status: HealthStatus): boolean {
  return status === "warn" || status === "paused";
}

export function matchesRosterFilter(status: HealthStatus, filter: RosterFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return isAtRisk(status);
  return status === filter;
}

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

export function filterRoster(
  clients: AdminClient[],
  query: string,
  filter: RosterFilter,
): AdminClient[] {
  return clients.filter(
    (c) => matchesRosterFilter(c.healthStatus, filter) && matchesRosterSearch(c, query),
  );
}

// Tenants the delivery overview's "at-risk accounts" panel should list.
export function atRiskClients(clients: AdminClient[]): AdminClient[] {
  return clients.filter((c) => isAtRisk(c.healthStatus));
}
