// Workspace > Today briefing.
//
// Pure aggregator: takes already-loaded inputs (clients, activity tail, per-client
// frontmatter, latest Meta KPIs, onboarding state) and returns a typed payload the
// page renders. No I/O lives here — the page does the disk reads and passes the
// data in.

import type { ClientEntry } from "./types";
import type { ActivityEvent } from "./activity";
import { ONBOARDING_PLAN, type OnboardingPhase } from "./onboardingPlan";

/** CPL drift threshold: default 20% above target. */
export const DEFAULT_CPL_DRIFT_PCT = 20;

/** Hours a creative form-run can sit before it surfaces as "awaiting approval". */
export const APPROVAL_STALENESS_HOURS = 48;

/** Form types we treat as creative deliverables that need client sign-off. */
const CREATIVE_FORM_HINTS = [
  "ad copy",
  "ad creative",
  "creative concept",
  "hook",
  "brief",
  "audience",
];

/** Per-client frontmatter slice the aggregator cares about. Pulled from
 *  `Profile.md` frontmatter. All fields optional — missing values just skip
 *  the client out of CPL drift. */
export interface ClientProfileMeta {
  /** Target cost per lead in dollars. */
  cplTarget?: number | null;
  /** Optional per-client drift override (percent above target). */
  cplDriftPct?: number | null;
  /** Average order value. Surfaced in tooltip context but not required. */
  aov?: number | null;
}

/** Latest Meta KPI snapshot the aggregator cares about. */
export interface ClientKpiSnapshot {
  /** Cost per acquisition / lead from `data/kpis/<slug>-YYYY-MM-DD.yaml`. */
  cpa: number | null;
  /** ISO date string of the snapshot (the `date` field on KpiEntry). */
  date: string;
}

/** Onboarding state slice — the `done` list of completed task IDs. */
export interface OnboardingStateLite {
  done: string[];
  /** Optional ISO timestamp the client was added. Used to compute phase-days. */
  startedAt?: string | null;
}

export interface BriefingInputs {
  clients: ClientEntry[];
  /** Newest-first tail from `tail_activity`. The aggregator filters as needed. */
  activity: ActivityEvent[];
  /** Per-client frontmatter, keyed by client slug. */
  profiles: Record<string, ClientProfileMeta>;
  /** Latest KPI snapshot per client, keyed by client slug. */
  kpis: Record<string, ClientKpiSnapshot>;
  /** Onboarding state per client, keyed by client slug. */
  onboarding: Record<string, OnboardingStateLite>;
  /** Inbox count from Gmail MCP. Stub until wired (see MorningBriefing.tsx). */
  inboxNeedingReply: number;
  /** "Now" anchor — pass `new Date()` from the caller; aggregator stays pure. */
  now: Date;
}

// ── Section payload shapes ─────────────────────────────────────

export interface InboxRow {
  /** Free-form label, e.g. "3 outreach replies + 2 client emails". */
  label: string;
}

export interface CplDriftRow {
  clientSlug: string;
  clientName: string;
  currentCpl: number;
  targetCpl: number;
  /** Percent above target, e.g. 32 means current is 32% over target. */
  deltaPct: number;
  /** ISO date the latest KPI snapshot was stamped. */
  sinceDate: string;
}

export interface CreativeApprovalRow {
  clientSlug: string;
  clientName: string;
  /** Summary copied from the originating activity event. */
  summary: string;
  /** Hours the creative has been waiting. */
  ageHours: number;
  /** Optional ref path so the row can deep-link to the output file. */
  refPath?: string;
}

export interface OnboardingSlipRow {
  clientSlug: string;
  clientName: string;
  /** The task that's slipping. */
  taskId: string;
  taskLabel: string;
  phaseNum: number;
  phaseName: string;
  /** Days past the phase's expected day (negative = on time). */
  daysOverdue: number;
}

export interface YesterdayWins {
  leads: number;
  formRuns: number;
  creativesShipped: number;
  outreachSent: number;
  replies: number;
}

export interface BriefingPayload {
  inbox: InboxRow[];
  cplDrift: CplDriftRow[];
  awaitingApproval: CreativeApprovalRow[];
  onboardingSlip: OnboardingSlipRow[];
  yesterdayWins: YesterdayWins;
  /** Stamped from the `now` input so the UI can show "Built at HH:MM". */
  builtAt: string;
}

// ── Section builders ───────────────────────────────────────────

function buildCplDrift(inputs: BriefingInputs): CplDriftRow[] {
  const rows: CplDriftRow[] = [];
  for (const c of inputs.clients) {
    if (c.status !== "live") continue;
    const profile = inputs.profiles[c.slug];
    const kpi = inputs.kpis[c.slug];
    if (!profile?.cplTarget || !kpi || kpi.cpa == null) continue;
    const threshold = profile.cplDriftPct ?? DEFAULT_CPL_DRIFT_PCT;
    const deltaPct = ((kpi.cpa - profile.cplTarget) / profile.cplTarget) * 100;
    if (deltaPct < threshold) continue;
    rows.push({
      clientSlug: c.slug,
      clientName: c.name,
      currentCpl: round2(kpi.cpa),
      targetCpl: round2(profile.cplTarget),
      deltaPct: Math.round(deltaPct),
      sinceDate: kpi.date,
    });
  }
  rows.sort((a, b) => b.deltaPct - a.deltaPct);
  return rows;
}

function isCreativeFormSummary(summary: string): boolean {
  const s = summary.toLowerCase();
  return CREATIVE_FORM_HINTS.some((hint) => s.includes(hint));
}

function buildAwaitingApproval(inputs: BriefingInputs): CreativeApprovalRow[] {
  const nowMs = inputs.now.getTime();
  const cutoffMs = nowMs - APPROVAL_STALENESS_HOURS * 3600 * 1000;
  // Track the latest creative form.run per (client, summary-key). Approvals
  // aren't separately recorded yet, so for v1 we treat any creative form.run
  // older than 48h as awaiting client sign-off.
  const rows: CreativeApprovalRow[] = [];
  for (const ev of inputs.activity) {
    if (ev.type !== "form.run") continue;
    if (!ev.clientSlug || !ev.ts) continue;
    if (!isCreativeFormSummary(ev.summary)) continue;
    const tsMs = new Date(ev.ts).getTime();
    if (!isFinite(tsMs) || tsMs > cutoffMs) continue;
    const client = inputs.clients.find((c) => c.slug === ev.clientSlug);
    rows.push({
      clientSlug: ev.clientSlug,
      clientName: client?.name ?? ev.clientSlug,
      summary: ev.summary,
      ageHours: Math.round((nowMs - tsMs) / 3600 / 1000),
      refPath: ev.refPath,
    });
  }
  // Dedupe by (clientSlug + summary), keep the oldest (highest age).
  const dedup = new Map<string, CreativeApprovalRow>();
  for (const r of rows) {
    const key = `${r.clientSlug}::${r.summary}`;
    const prior = dedup.get(key);
    if (!prior || prior.ageHours < r.ageHours) dedup.set(key, r);
  }
  return Array.from(dedup.values()).sort((a, b) => b.ageHours - a.ageHours);
}

/** Compute the cumulative "expected day" for each task in the canonical plan.
 *  Phase 1 = day 0, phase 2 = day 1, phase 3 = day 2, phase 4 = day 4, phase 5
 *  = day 6 — matches the `meta` strings on `OnboardingPhase`. */
function phaseExpectedDay(phase: OnboardingPhase): number {
  switch (phase.num) {
    case 1: return 0;
    case 2: return 1;
    case 3: return 3;
    case 4: return 5;
    case 5: return 6;
    default: return 7;
  }
}

function buildOnboardingSlip(inputs: BriefingInputs): OnboardingSlipRow[] {
  const rows: OnboardingSlipRow[] = [];
  for (const c of inputs.clients) {
    if (c.status !== "pre-launch") continue;
    const state = inputs.onboarding[c.slug];
    if (!state) continue;
    const startedIso = state.startedAt ?? c.created_at;
    if (!startedIso) continue;
    const startedMs = new Date(startedIso).getTime();
    if (!isFinite(startedMs)) continue;
    const daysSinceStart = Math.floor(
      (inputs.now.getTime() - startedMs) / (24 * 3600 * 1000),
    );
    const done = new Set(state.done ?? []);
    for (const phase of ONBOARDING_PLAN) {
      const expectedDay = phaseExpectedDay(phase);
      if (daysSinceStart < expectedDay) continue;
      for (const ss of phase.subsections) {
        for (const t of ss.tasks) {
          if (done.has(t.id)) continue;
          const daysOverdue = daysSinceStart - expectedDay;
          rows.push({
            clientSlug: c.slug,
            clientName: c.name,
            taskId: t.id,
            taskLabel: t.label,
            phaseNum: phase.num,
            phaseName: phase.name,
            daysOverdue,
          });
        }
      }
    }
  }
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return rows;
}

function buildYesterdayWins(inputs: BriefingInputs): YesterdayWins {
  const now = inputs.now;
  const yStart = new Date(now);
  yStart.setHours(0, 0, 0, 0);
  yStart.setDate(yStart.getDate() - 1);
  const yEnd = new Date(yStart);
  yEnd.setDate(yEnd.getDate() + 1);
  const startMs = yStart.getTime();
  const endMs = yEnd.getTime();

  const wins: YesterdayWins = {
    leads: 0,
    formRuns: 0,
    creativesShipped: 0,
    outreachSent: 0,
    replies: 0,
  };

  for (const ev of inputs.activity) {
    if (!ev.ts) continue;
    const ms = new Date(ev.ts).getTime();
    if (!isFinite(ms) || ms < startMs || ms >= endMs) continue;
    switch (ev.type) {
      case "scraper.run": {
        // Try to pull a lead-count from the summary, e.g. "Scraped 12 leads".
        const m = /(\d+)\s+lead/i.exec(ev.summary);
        wins.leads += m ? parseInt(m[1], 10) : 0;
        break;
      }
      case "form.run":
        wins.formRuns += 1;
        break;
      case "mockup.generated":
        wins.creativesShipped += 1;
        break;
      case "outreach.sent":
        wins.outreachSent += 1;
        break;
      case "outreach.reply":
        wins.replies += 1;
        break;
    }
  }
  return wins;
}

function buildInbox(inputs: BriefingInputs): InboxRow[] {
  if (inputs.inboxNeedingReply <= 0) return [];
  return [
    {
      label: `${inputs.inboxNeedingReply} email${inputs.inboxNeedingReply === 1 ? "" : "s"} awaiting reply > 24h`,
    },
  ];
}

export function buildBriefing(inputs: BriefingInputs): BriefingPayload {
  return {
    inbox: buildInbox(inputs),
    cplDrift: buildCplDrift(inputs),
    awaitingApproval: buildAwaitingApproval(inputs),
    onboardingSlip: buildOnboardingSlip(inputs),
    yesterdayWins: buildYesterdayWins(inputs),
    builtAt: inputs.now.toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
