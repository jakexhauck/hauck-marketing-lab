import type { PillarConstraint } from "./api";

// Pure helpers for the Command home (Task 2). Kept out of the component so
// the funnel ordering, severity vocabulary, and constraint lookups stay
// independently testable without React or a network mock.

type Pillar = PillarConstraint["pillar"];
type Severity = PillarConstraint["severity"];

// Acquisition -> Sales -> Service Delivery: the linear funnel, front to back.
// Operations is the enabler underneath, never part of this sequence, so it is
// intentionally excluded here.
export const FUNNEL_PILLARS = ["acquisition", "sales", "delivery"] as const;

export const PILLAR_LABELS: Record<Pillar, string> = {
  acquisition: "Acquisition",
  sales: "Sales",
  delivery: "Service Delivery",
  operations: "Operations",
};

// Service Delivery has its own dedicated cockpit route; every other pillar
// uses the generic Theory-of-Constraints pillar workspace.
export function pillarRoute(pillar: Pillar): string {
  return pillar === "delivery" ? "/admin/delivery" : `/admin/pillar/${pillar}`;
}

const SEVERITY_WORD: Record<Severity, string> = {
  high: "BINDING",
  med: "WATCH",
  low: "SLACK",
};

export function severityWord(severity: Severity): string {
  return SEVERITY_WORD[severity];
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, med: 1, low: 2 };

// Ranked high -> med -> low. The API already returns rows in this order, but
// the client sorts explicitly rather than trusting response order to hold.
export function sortBySeverity<T extends { severity: Severity }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// The single governing constraint (exactly one row has isSystem=true once the
// table is populated). Undefined on an empty or not-yet-set table.
export function findSystemConstraint(
  constraints: PillarConstraint[],
): PillarConstraint | undefined {
  return constraints.find((c) => c.isSystem);
}

export function findConstraintForPillar(
  constraints: PillarConstraint[],
  pillar: Pillar,
): PillarConstraint | undefined {
  return constraints.find((c) => c.pillar === pillar);
}
