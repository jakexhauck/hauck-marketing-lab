/**
 * Ads optimizer decision engine — pure functions, no I/O.
 *
 * Encodes the rules from `vault/Knowledge/Ads Key/learning-phase-framework.md`
 * and the 3.11 AI Campaign Optimizer lesson. Given an ad's current metrics, its
 * 7-day history, the client's target CPA, and the last time anyone touched it,
 * returns a deterministic verdict (KILL / WATCH / SCALE / REFRESH / HOLD_*).
 *
 * One source of truth for the thresholds: the constants at the top of this
 * file. Tune them here, the whole app moves with it.
 *
 * The engine is deliberately not an LLM — the lesson's rules are arithmetic.
 * A model would translate them into worse code, slower, and you couldn't
 * unit-test it. Aurelius's job (in a later layer) is to wrap the verdict in
 * client-ready prose, not to make the decision.
 */

import type { MetaAd, MetaAdsAccount } from "./mockMetaAds";

// ── Thresholds (verbatim from the lesson) ──────────────────────────────────
export const KILL_CPA_MULTIPLE = 3.0;
export const WATCH_CPA_MULTIPLE = 1.5;
/** Minimum spend before we'll judge an ad. Lesson: "2-3x target CPA in spend
 *  before judging". We take the lower bound so we surface verdicts sooner. */
export const MIN_SPEND_MULTIPLE_BEFORE_KILL = 2.0;
export const REFRESH_FREQUENCY = 3.0;
/** Midpoint of the lesson's 20-30% range. */
export const SCALE_INCREMENT_PCT = 25;
export const SCALE_COOLDOWN_DAYS = 2;
/** "Wait 2-3 days for more data" on a WATCH before escalating to kill. */
export const WATCH_TIMEOUT_DAYS = 3;
/** Learning phase: Meta needs ~50 conversions/week per ad set. */
export const LEARNING_PHASE_MIN_CONVERSIONS_7D = 50;
/** Don't judge an ad in its first 24h. */
export const HOLD_YOUNG_HOURS = 24;
/** Default target ROAS multiple. Lesson 3.2 ("Setting Ad Budgets") states
 *  "Above 3x = client is happy." We use that as the floor for deriving
 *  target CPA = LTV / target_roas when no per-client override is set. */
export const DEFAULT_TARGET_ROAS = 3.0;

// ── Target CPA derivation ──────────────────────────────────────────────────

export interface TargetCpaSource {
  /** Operator-supplied override. Wins over the LTV math when set. */
  targetCpaOverride?: number | null;
  /** Average customer value (LTV) in dollars. */
  avgCustomerValue?: number | null;
  /** Target ROAS multiple. Falls back to DEFAULT_TARGET_ROAS when null. */
  targetRoas?: number | null;
}

export interface DerivedTargetCpa {
  /** The number the optimizer should use, or null when inputs are missing. */
  value: number | null;
  /** How the value was reached, for the Settings panel and audit log. */
  source: "override" | "ltv" | "missing";
  /** Effective target ROAS used in the math. Reflects the default when no
   *  per-client value was set. */
  effectiveRoas: number;
}

/**
 * Compute the target CPA the optimizer should apply to a client.
 *
 *   target_cpa = target_cpa_override
 *             ?? (avg_customer_value / (target_roas ?? DEFAULT_TARGET_ROAS))
 *             ?? null
 *
 * The override wins so operators can pin a number in niches where the LTV
 * math is wrong. The default ROAS comes from lesson 3.2's "client is happy"
 * threshold so target_cpa is conservative by default (the optimizer would
 * rather hold a borderline ad than kill a working one).
 */
export function deriveTargetCpa(src: TargetCpaSource): DerivedTargetCpa {
  const roas =
    src.targetRoas && src.targetRoas > 0 ? src.targetRoas : DEFAULT_TARGET_ROAS;
  if (src.targetCpaOverride && src.targetCpaOverride > 0) {
    return { value: src.targetCpaOverride, source: "override", effectiveRoas: roas };
  }
  if (src.avgCustomerValue && src.avgCustomerValue > 0) {
    return {
      value: src.avgCustomerValue / roas,
      source: "ltv",
      effectiveRoas: roas,
    };
  }
  return { value: null, source: "missing", effectiveRoas: roas };
}

// ── Verdict shape ──────────────────────────────────────────────────────────

export type VerdictKind =
  | "KILL"
  | "WATCH"
  | "SCALE"
  | "REFRESH"
  | "HOLD_LEARNING"
  | "HOLD_YOUNG"
  | "HOLD_COOLDOWN"
  | "HOLD_LOW_SPEND"
  | "HOLD_NO_TARGET"
  | "OK";

export interface SuggestedAction {
  /** What button/CTA to surface in the UI. */
  label: string;
  /** What the operator should expect to happen on click. */
  detail: string;
  /** For SCALE only — the new daily budget rounded to whole dollars. */
  newDailyBudget?: number;
}

export interface Verdict {
  kind: VerdictKind;
  /** One-line plain-English explanation, threshold-aware. */
  reason: string;
  /** 0-1. Drives the confidence chip on the recommendation card. */
  confidence: number;
  action?: SuggestedAction;
  /** True when the verdict is non-actionable (the operator should ignore it
   *  unless they want context). UI hides HOLD_* and OK from the main feed. */
  silent: boolean;
}

// ── Input shape ────────────────────────────────────────────────────────────

export interface AdSnapshot {
  /** Account-level conversions for the ad's parent ad set in the last 7
   *  days. Drives learning-phase detection. */
  adSet7dConversions: number;
  /** Hours since the ad was created. */
  ageHours: number;
  /** Daily budget of the ad set this ad sits inside. Drives SCALE math. */
  parentAdSetBudgetDaily: number;
  /** ISO timestamp of the last manual or auto action against this ad. Null
   *  when we have no record. */
  lastTouchedAt: string | null;
  /** How long the current WATCH state has been live, in days. Null if not
   *  on a WATCH streak. Used to escalate to KILL after WATCH_TIMEOUT_DAYS. */
  watchStreakDays: number | null;
}

export interface DecideInput {
  ad: MetaAd;
  snapshot: AdSnapshot;
  targetCpa: number | null;
  /** Current wall-clock time. Injected so tests can pin it. */
  now?: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / (1000 * 60 * 60 * 24);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Core decision ──────────────────────────────────────────────────────────

export function decideAd(input: DecideInput): Verdict {
  const { ad, snapshot, targetCpa } = input;
  const now = input.now ?? new Date();

  // Hard skips first, in priority order.
  if (targetCpa == null || !Number.isFinite(targetCpa) || targetCpa <= 0) {
    return {
      kind: "HOLD_NO_TARGET",
      reason: "No target CPA set for this client. Enter LTV (avg customer value) in Client Hub → Settings to enable the optimizer.",
      confidence: 1,
      silent: true,
    };
  }

  if (snapshot.ageHours < HOLD_YOUNG_HOURS) {
    return {
      kind: "HOLD_YOUNG",
      reason: `Ad is ${snapshot.ageHours.toFixed(0)}h old. Wait until ${HOLD_YOUNG_HOURS}h before judging — early CPL is noise.`,
      confidence: 1,
      silent: true,
    };
  }

  if (snapshot.adSet7dConversions < LEARNING_PHASE_MIN_CONVERSIONS_7D) {
    return {
      kind: "HOLD_LEARNING",
      reason: `Ad set has ${snapshot.adSet7dConversions} conversions in last 7d (needs ${LEARNING_PHASE_MIN_CONVERSIONS_7D} to exit learning). Don't touch — Meta is still learning.`,
      confidence: 1,
      silent: true,
    };
  }

  // Refresh trumps everything else when frequency is blown — even a winner
  // burns out. Surface it before SCALE so the operator refreshes creative
  // before pouring more spend on a tired ad.
  if (ad.frequency >= REFRESH_FREQUENCY) {
    return {
      kind: "REFRESH",
      reason: `Frequency is ${ad.frequency.toFixed(2)} (threshold ${REFRESH_FREQUENCY.toFixed(1)}). Audience is seeing this ad too often. Add 3-5 new creatives.`,
      confidence: 0.88,
      action: {
        label: "Generate 5 new creatives",
        detail: "Opens the Ads Sequence Wizard with the parent ad set's audience/angle pre-filled. Keep the old ads running.",
      },
      silent: false,
    };
  }

  const cpa = ad.results > 0 ? ad.spend / ad.results : Number.POSITIVE_INFINITY;
  const cpaVsTarget = cpa / targetCpa;
  const minSpendBeforeKill = MIN_SPEND_MULTIPLE_BEFORE_KILL * targetCpa;

  // Cheap escape hatch: too little spend to draw any conclusion.
  if (ad.spend < minSpendBeforeKill && cpaVsTarget >= WATCH_CPA_MULTIPLE) {
    return {
      kind: "HOLD_LOW_SPEND",
      reason: `Only $${round2(ad.spend)} spent. Needs $${round2(minSpendBeforeKill)} (${MIN_SPEND_MULTIPLE_BEFORE_KILL}× target CPA) before we can judge. Hold.`,
      confidence: 1,
      silent: true,
    };
  }

  // KILL: CPA ≥ 3× target AND spent enough to have a real signal.
  if (cpaVsTarget >= KILL_CPA_MULTIPLE && ad.spend >= minSpendBeforeKill) {
    return {
      kind: "KILL",
      reason: `CPA $${round2(cpa)} is ${cpaVsTarget.toFixed(1)}× target ($${round2(targetCpa)}) after $${round2(ad.spend)} spent. Turn it off.`,
      confidence: 0.92,
      action: {
        label: "Pause ad",
        detail: "Sends a pause request to Meta. Reversible — you can resume any time.",
      },
      silent: false,
    };
  }

  // WATCH: CPA 1.5-3× target. After WATCH_TIMEOUT_DAYS, escalate to KILL.
  if (cpaVsTarget >= WATCH_CPA_MULTIPLE && cpaVsTarget < KILL_CPA_MULTIPLE) {
    const streak = snapshot.watchStreakDays ?? 0;
    if (streak >= WATCH_TIMEOUT_DAYS) {
      return {
        kind: "KILL",
        reason: `Watched for ${streak.toFixed(0)} days at ${cpaVsTarget.toFixed(1)}× target with no improvement. Pull the trigger.`,
        confidence: 0.86,
        action: {
          label: "Pause ad",
          detail: "Watch window expired with no improvement. Cleanest call.",
        },
        silent: false,
      };
    }
    const daysLeft = Math.max(1, WATCH_TIMEOUT_DAYS - streak);
    return {
      kind: "WATCH",
      reason: `CPA $${round2(cpa)} is ${cpaVsTarget.toFixed(1)}× target. Give it ${daysLeft.toFixed(0)} more day${daysLeft === 1 ? "" : "s"} before killing.`,
      confidence: 0.7,
      silent: false,
    };
  }

  // SCALE: CPA ≤ target. Respect cooldown.
  if (cpaVsTarget <= 1.0) {
    if (snapshot.lastTouchedAt) {
      const sinceTouch = daysBetween(snapshot.lastTouchedAt, now);
      if (sinceTouch < SCALE_COOLDOWN_DAYS) {
        const daysLeft = Math.max(1, SCALE_COOLDOWN_DAYS - sinceTouch);
        return {
          kind: "HOLD_COOLDOWN",
          reason: `Winner at ${cpaVsTarget.toFixed(2)}× target, but last touched ${sinceTouch.toFixed(1)}d ago. Wait ${daysLeft.toFixed(1)} more day${daysLeft >= 2 ? "s" : ""} before the next scale step.`,
          confidence: 1,
          silent: true,
        };
      }
    }
    const newBudget = Math.round(
      snapshot.parentAdSetBudgetDaily * (1 + SCALE_INCREMENT_PCT / 100),
    );
    return {
      kind: "SCALE",
      reason: `CPA $${round2(cpa)} is ${cpaVsTarget.toFixed(2)}× target. Bump the parent ad set ${SCALE_INCREMENT_PCT}% from $${round2(snapshot.parentAdSetBudgetDaily)}/day to $${newBudget}/day.`,
      confidence: 0.84,
      action: {
        label: `Scale +${SCALE_INCREMENT_PCT}%`,
        detail: `Sets the ad set's daily budget to $${newBudget}. Resets the ${SCALE_COOLDOWN_DAYS}-day cooldown.`,
        newDailyBudget: newBudget,
      },
      silent: false,
    };
  }

  // OK band: 1.0 < CPL/target < 1.5. Working, no action.
  return {
    kind: "OK",
    reason: `CPA $${round2(cpa)} at ${cpaVsTarget.toFixed(2)}× target. In the comfort band, leave it alone.`,
    confidence: 0.8,
    silent: true,
  };
}

// ── Account-level rollup ───────────────────────────────────────────────────

export interface AccountVerdict {
  accountId: string;
  clientName: string;
  /** All ads with a non-silent verdict. Sorted by descending severity. */
  recommendations: Array<{
    campaignId: string;
    campaignName: string;
    adSetId: string;
    adSetName: string;
    adId: string;
    adName: string;
    verdict: Verdict;
  }>;
  /** Counts by verdict kind for the summary chip on the panel. */
  counts: Record<VerdictKind, number>;
}

/**
 * Severity ordering for sorting the recommendations feed.
 * Lower = more urgent.
 */
const KIND_PRIORITY: Record<VerdictKind, number> = {
  KILL: 0,
  REFRESH: 1,
  SCALE: 2,
  WATCH: 3,
  OK: 4,
  HOLD_COOLDOWN: 5,
  HOLD_LOW_SPEND: 6,
  HOLD_LEARNING: 7,
  HOLD_YOUNG: 8,
  HOLD_NO_TARGET: 9,
};

export interface DecideAccountInput {
  account: MetaAdsAccount;
  targetCpa: number | null;
  /** Map from ad id → most-recent log row for that ad. Provides the
   *  watch streak / last-touched signals. Anything missing is treated as
   *  "no prior state" (ageHours from Meta-side created_time would feed in
   *  via a future enrichment; for v1 we pessimistically allow judgement
   *  once spend crosses the floor). */
  history?: Map<string, Pick<AdSnapshot, "lastTouchedAt" | "watchStreakDays" | "ageHours">>;
  now?: Date;
}

export function decideAccount(input: DecideAccountInput): AccountVerdict {
  const { account, targetCpa } = input;
  const history = input.history ?? new Map();
  const now = input.now ?? new Date();

  const recommendations: AccountVerdict["recommendations"] = [];
  const counts = Object.fromEntries(
    Object.keys(KIND_PRIORITY).map((k) => [k, 0]),
  ) as Record<VerdictKind, number>;

  for (const campaign of account.campaigns) {
    for (const adSet of campaign.adSets) {
      for (const ad of adSet.ads) {
        const hist = history.get(ad.id);
        const snapshot: AdSnapshot = {
          adSet7dConversions: adSet.results,
          ageHours: hist?.ageHours ?? 72,
          parentAdSetBudgetDaily: adSet.budgetDaily,
          lastTouchedAt: hist?.lastTouchedAt ?? null,
          watchStreakDays: hist?.watchStreakDays ?? null,
        };
        const verdict = decideAd({ ad, snapshot, targetCpa, now });
        counts[verdict.kind] += 1;
        if (!verdict.silent) {
          recommendations.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            adSetId: adSet.id,
            adSetName: adSet.name,
            adId: ad.id,
            adName: ad.name,
            verdict,
          });
        }
      }
    }
  }

  recommendations.sort((a, b) => {
    const pa = KIND_PRIORITY[a.verdict.kind];
    const pb = KIND_PRIORITY[b.verdict.kind];
    if (pa !== pb) return pa - pb;
    return b.verdict.confidence - a.verdict.confidence;
  });

  return {
    accountId: account.accountId,
    clientName: account.clientName,
    recommendations,
    counts,
  };
}

// ── Verdict presentation helpers (consumed by the panel UI) ────────────────

export function verdictPillClass(kind: VerdictKind): string {
  switch (kind) {
    case "KILL":
      return "hml-verdict-kill";
    case "WATCH":
      return "hml-verdict-watch";
    case "SCALE":
      return "hml-verdict-scale";
    case "REFRESH":
      return "hml-verdict-refresh";
    default:
      return "hml-verdict-hold";
  }
}

export function verdictLabel(kind: VerdictKind): string {
  switch (kind) {
    case "KILL":
      return "Kill";
    case "WATCH":
      return "Watch";
    case "SCALE":
      return "Scale";
    case "REFRESH":
      return "Refresh creative";
    case "HOLD_LEARNING":
      return "Learning phase";
    case "HOLD_YOUNG":
      return "Too young";
    case "HOLD_COOLDOWN":
      return "Cooldown";
    case "HOLD_LOW_SPEND":
      return "Not enough spend";
    case "HOLD_NO_TARGET":
      return "Set LTV";
    case "OK":
      return "On target";
  }
}
