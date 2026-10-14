import type { ConstraintStep, PillarConstraint } from "./api";

// Pure helpers for the Command home (Task 2) and the pillar / delivery
// attack-plan views built on top of the same constraint rows (Task 3+). Kept
// out of the components so the funnel ordering, severity vocabulary, and
// constraint lookups stay independently testable without React or a network
// mock.

type Pillar = PillarConstraint["pillar"];
type Severity = PillarConstraint["severity"];
type StepStatus = ConstraintStep["status"];

// Acquisition -> Sales -> Service Delivery: the linear funnel, front to back.
// Operations is the enabler underneath, never part of this sequence, so it is
// intentionally excluded here.
export const FUNNEL_PILLARS = ["acquisition", "sales", "delivery"] as const;

export const PILLAR_LABELS: Record<Pillar, string> = {
  acquisition: "Acquisition",
  sales: "Sales",
  delivery: "Fulfillment",
  operations: "Operations",
};

// Fulfillment's pages are real routes of their own rather than tabs on a pillar
// page, so it opens on the first row of its rail (Onboarding); every other
// pillar uses the generic Theory-of-Constraints pillar workspace.
export function pillarRoute(pillar: Pillar): string {
  return pillar === "delivery" ? "/admin/onboarding" : `/admin/pillar/${pillar}`;
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

const STEP_STATUS_WORD: Record<StepStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

// The attack-plan step status tag vocabulary (Identify/Exploit/Subordinate/
// Elevate/Repeat steps carry one of these three states).
export function stepStatusWord(status: StepStatus): string {
  return STEP_STATUS_WORD[status];
}

// Attack-plan steps carry their own explicit sort; the API already returns
// them in order, but the client sorts rather than trusting response order.
export function sortSteps(steps: ConstraintStep[]): ConstraintStep[] {
  return [...steps].sort((a, b) => a.sort - b.sort);
}

// ===== Constraint editor (Task 4.2) =====
//
// The edit form works on strings (text inputs never carry null), while the
// API payload uses `string | null` for the optional fields. This local shape
// keeps that boundary explicit: `toFormState`/`buildConstraintPayload` are
// the only two places that cross it.
export interface ConstraintFormState {
  pillar: Pillar;
  title: string;
  severity: Severity;
  metric: string;
  detail: string;
  impact: string;
  isSystem: boolean;
  throughputVal: string;
  throughputLabel: string;
  steps: ConstraintStep[];
}

export function toFormState(constraint: PillarConstraint): ConstraintFormState {
  return {
    pillar: constraint.pillar,
    title: constraint.title,
    severity: constraint.severity,
    metric: constraint.metric ?? "",
    detail: constraint.detail ?? "",
    impact: constraint.impact ?? "",
    isSystem: constraint.isSystem,
    throughputVal: constraint.throughputVal ?? "",
    throughputLabel: constraint.throughputLabel ?? "",
    steps: sortSteps(constraint.steps),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Re-sequences a step list's `sort` to match its array order (0..n),
// independent of whatever `sort` values the steps carried coming in.
// Reorder/add/remove/save all funnel through this so `sort` never drifts
// from the order the admin sees on screen.
export function resequenceSteps(steps: ConstraintStep[]): ConstraintStep[] {
  return steps.map((s, i) => ({ ...s, sort: i }));
}

export function reorderConstraintStep(
  steps: ConstraintStep[],
  index: number,
  direction: "up" | "down",
): ConstraintStep[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
    return steps;
  }
  const next = [...steps];
  const swap = next[index];
  next[index] = next[target];
  next[target] = swap;
  return resequenceSteps(next);
}

const BLANK_STEP_TYPE = "Identify";

export function addConstraintStep(steps: ConstraintStep[]): ConstraintStep[] {
  const blank: ConstraintStep = {
    step: BLANK_STEP_TYPE,
    action: "",
    owner: null,
    status: "todo",
    sort: steps.length,
  };
  return resequenceSteps([...steps, blank]);
}

export function removeConstraintStep(steps: ConstraintStep[], index: number): ConstraintStep[] {
  return resequenceSteps(steps.filter((_, i) => i !== index));
}

// The pure payload builder for the constraint editor's Save button: trims
// text fields, turns blank optional fields into null (matching what
// getConstraints() returns for an unset field), and resequences steps so
// `sort` always matches the visible order regardless of how it drifted
// during editing.
export function buildConstraintPayload(
  form: ConstraintFormState,
): Omit<PillarConstraint, "updatedAt"> {
  return {
    pillar: form.pillar,
    title: form.title.trim(),
    severity: form.severity,
    metric: blankToNull(form.metric),
    detail: blankToNull(form.detail),
    impact: blankToNull(form.impact),
    isSystem: form.isSystem,
    throughputVal: blankToNull(form.throughputVal),
    throughputLabel: blankToNull(form.throughputLabel),
    steps: resequenceSteps(form.steps).map((s) => ({
      step: s.step,
      action: s.action.trim(),
      owner: s.owner && s.owner.trim() !== "" ? s.owner.trim() : null,
      status: s.status,
      sort: s.sort,
    })),
  };
}
