// When startup monitoring wakes an agent.
//
// Plain code pulls the numbers first (the app's snapshot endpoint) and Claude
// only runs where something moved or crossed a line. Seven agents times every
// client on every logon would eat the subscription for findings that mostly
// say "nothing changed".
//
// The lines (Jake to check, 2026-10-17):
//   - CPL moved 20% or more, either way, against the last snapshot  -> Ads
//   - frequency at or above 3.0 (the audience is seeing it too often) -> Ads
//   - any lead sitting in New for over 48 hours                       -> GHL
//   - the setup checklist or the account checks changed               -> Manager
//
// The first two are absolute or relative to last time; with no snapshot from
// last time only the absolute ones can fire, which is why a brand new client
// does not wake the Ads Agent over a CPL "change" from nothing.

import type { AgentId, ClaimTenant, Snapshot } from "./wire.ts";

export const MONITOR_GAP_MS = 6 * 60 * 60 * 1000;
export const CPL_MOVE = 0.2;
export const FREQUENCY_LINE = 3.0;
export const STUCK_NEW_HOURS = 48;

export interface MonitorRow {
  tenantId: string;
  agent: AgentId;
  reason: string;
}

export function shouldRunMonitor(lastMonitorAt: string | null, now: Date): boolean {
  if (!lastMonitorAt) return true;
  const last = Date.parse(lastMonitorAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= MONITOR_GAP_MS;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function planMonitor(
  tenants: Pick<ClaimTenant, "id">[],
  prev: Record<string, Snapshot>,
  next: Record<string, Snapshot>,
): MonitorRow[] {
  const rows: MonitorRow[] = [];
  for (const t of tenants) {
    const now = next[t.id];
    // No snapshot this time (the endpoint failed for this client): nothing to
    // judge, and certainly not a reason to wake anyone.
    if (!now) continue;
    const was = prev[t.id];
    const ads: string[] = [];

    if (was && was.cpl !== null && now.cpl !== null && was.cpl > 0) {
      // |next - prev| / prev rather than next / prev - 1: the second rounds
      // 48 / 40 to 0.19999 and a clean 20% move would not fire.
      const move = Math.abs(now.cpl - was.cpl) / was.cpl;
      if (move >= CPL_MOVE) {
        const dir = now.cpl > was.cpl ? "up" : "down";
        ads.push(`CPL ${dir} ${Math.round(move * 100)}% (${money(was.cpl)} to ${money(now.cpl)})`);
      }
    }
    if (now.frequency !== null && now.frequency >= FREQUENCY_LINE) {
      ads.push(`Frequency at ${now.frequency.toFixed(1)}`);
    }
    if (ads.length) rows.push({ tenantId: t.id, agent: "ads", reason: ads.join("; ") });

    if (now.stuckNewOver48h > 0) {
      const n = now.stuckNewOver48h;
      rows.push({ tenantId: t.id, agent: "ghl", reason: `${n} lead${n === 1 ? "" : "s"} in New over ${STUCK_NEW_HOURS}h` });
    }

    if (was) {
      const mgr: string[] = [];
      if (was.checklistDone !== now.checklistDone || was.checklistTotal !== now.checklistTotal) {
        mgr.push(
          `Setup tasks ${was.checklistDone}/${was.checklistTotal} to ${now.checklistDone}/${now.checklistTotal}`,
        );
      }
      if (was.accountsRed !== now.accountsRed) mgr.push(`Account checks red ${was.accountsRed} to ${now.accountsRed}`);
      if (mgr.length) rows.push({ tenantId: t.id, agent: "manager", reason: mgr.join("; ") });
    }
  }
  return rows;
}
