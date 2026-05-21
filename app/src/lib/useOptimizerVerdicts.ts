/**
 * useOptimizerVerdicts — wires live Meta Ads data into the optimizer engine
 * and persists per-ad snapshots to the vault CSV log.
 *
 * Per Jake's plan:
 *   - 6-hour cadence while the Ads Manager is open (plus once on mount).
 *   - Suggest-only mode: never auto-executes anything. Just produces verdicts
 *     that the Recommendations panel consumes.
 *   - Skips clients with `optimizer_mode` unset or `"off"` and clients
 *     without a target CPL.
 *
 * The hook owns its own snapshot/log writes; the verdicts are recomputed any
 * time the upstream `accounts` array changes (e.g. user clicks Refresh on the
 * Ads page or the 15-min Meta cache rolls).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./tauri";
import {
  decideAccount,
  deriveTargetCpa,
  type AccountVerdict,
  type AdSnapshot,
} from "./adsOptimizer";
import type { MetaAdsAccount } from "./mockMetaAds";
import type { AdsLogRow, ClientEntry } from "./types";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const HISTORY_DAYS = 14;

export interface UseOptimizerVerdictsResult {
  /** Verdict bundle keyed by client slug. Only present for opted-in clients. */
  verdicts: Map<string, AccountVerdict>;
  /** Timestamp of the last successful snapshot write, ms. Null until first run. */
  lastSnapshotAt: number | null;
  /** Trigger an immediate fetch + decide + log write. */
  runNow: () => Promise<void>;
  /** True while a snapshot write is in-flight. */
  busy: boolean;
  /** Most recent error, if any. Cleared on the next successful run. */
  error: string | null;
}

/**
 * Build the per-ad snapshot inputs from the loaded accounts plus prior CSV
 * history. The history feeds two signals back into the engine:
 *
 *   - watchStreakDays: count consecutive past entries where the ad's verdict
 *     was WATCH. After WATCH_TIMEOUT_DAYS the engine escalates to KILL.
 *   - lastTouchedAt: when the engine last suggested an action (or the user
 *     applied one). Drives the SCALE cooldown.
 */
function buildHistoryMap(
  rows: AdsLogRow[],
): Map<string, Pick<AdSnapshot, "lastTouchedAt" | "watchStreakDays" | "ageHours">> {
  const byAd = new Map<string, AdsLogRow[]>();
  for (const r of rows) {
    if (!r.adId) continue;
    const arr = byAd.get(r.adId) ?? [];
    arr.push(r);
    byAd.set(r.adId, arr);
  }

  const out = new Map<
    string,
    Pick<AdSnapshot, "lastTouchedAt" | "watchStreakDays" | "ageHours">
  >();
  for (const [adId, adRows] of byAd) {
    adRows.sort((a, b) => a.ts.localeCompare(b.ts));

    let lastTouchedAt: string | null = null;
    for (let i = adRows.length - 1; i >= 0; i--) {
      const r = adRows[i];
      if (r.actionTaken && r.actionTaken.length > 0) {
        lastTouchedAt = r.ts;
        break;
      }
    }

    // Walk backwards through unique calendar days. Count consecutive WATCH
    // verdicts at the tail of the streak.
    const seenDays = new Set<string>();
    let watchStreakDays = 0;
    for (let i = adRows.length - 1; i >= 0; i--) {
      const r = adRows[i];
      if (seenDays.has(r.date)) continue;
      seenDays.add(r.date);
      if (r.verdict === "WATCH") {
        watchStreakDays += 1;
      } else {
        break;
      }
    }

    // Age in hours from the very first time we saw this ad in the log.
    let ageHours = 72; // fall-back assumption when we have no history
    if (adRows.length > 0) {
      const firstTs = Date.parse(adRows[0].ts);
      if (Number.isFinite(firstTs)) {
        ageHours = (Date.now() - firstTs) / (1000 * 60 * 60);
      }
    }

    out.set(adId, {
      lastTouchedAt,
      watchStreakDays: watchStreakDays > 0 ? watchStreakDays : null,
      ageHours,
    });
  }
  return out;
}

/** Today's date in YYYY-MM-DD (local time — matches what the operator sees). */
function isoDateToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function accountToLogRows(
  account: MetaAdsAccount,
  verdict: AccountVerdict,
): AdsLogRow[] {
  const ts = new Date().toISOString();
  const date = isoDateToday();
  const verdictByAd = new Map(
    verdict.recommendations.map((r) => [r.adId, r.verdict]),
  );

  const rows: AdsLogRow[] = [];
  for (const campaign of account.campaigns) {
    for (const adSet of campaign.adSets) {
      for (const ad of adSet.ads) {
        const v = verdictByAd.get(ad.id);
        rows.push({
          ts,
          date,
          adId: ad.id,
          adName: ad.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          adSetId: adSet.id,
          adSetName: adSet.name,
          spend: ad.spend,
          results: ad.results,
          cpl: ad.results > 0 ? ad.spend / ad.results : 0,
          ctr: ad.ctr,
          cpm: ad.cpm,
          frequency: ad.frequency,
          ageHours: 0, // populated by the engine via history; not used downstream
          parentAdSetBudget: adSet.budgetDaily,
          verdict: v?.kind ?? "OK",
          verdictReason: v?.reason ?? "",
          actionTaken: "",
        });
      }
    }
  }
  return rows;
}

export function useOptimizerVerdicts(
  accounts: MetaAdsAccount[],
  clients: ClientEntry[],
  root: string | null,
): UseOptimizerVerdictsResult {
  const [verdicts, setVerdicts] = useState<Map<string, AccountVerdict>>(
    new Map(),
  );
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Map slug → ClientEntry for quick lookup inside the loop. */
  const clientBySlug = useMemo(() => {
    const m = new Map<string, ClientEntry>();
    for (const c of clients) m.set(c.slug, c);
    return m;
  }, [clients]);

  // Track which account/client pairs we've already computed verdicts for so
  // we can skip the work when the accounts array reference changes but its
  // content doesn't.
  const accountsKey = useMemo(
    () =>
      accounts
        .map(
          (a) =>
            `${a.accountId}:${a.totals.spend}:${a.totals.results}:${a.campaigns.length}`,
        )
        .join("|"),
    [accounts],
  );

  /** Compute verdicts from current accounts data + saved history. */
  const compute = async () => {
    if (!root) return;
    setBusy(true);
    setError(null);
    try {
      const next = new Map<string, AccountVerdict>();
      for (const account of accounts) {
        // The account's clientName is the same name the client.yaml has,
        // and `read_ads_log` looks up by slug, so we need the slug. We
        // attached it earlier via the Meta loader (clientSlug field).
        const slug = account.clientSlug;
        if (!slug) continue;
        const client = clientBySlug.get(slug);
        if (!client) continue;
        if ((client.optimizer_mode ?? "off") === "off") continue;
        const derived = deriveTargetCpa({
          targetCpaOverride: client.target_cpa_override,
          avgCustomerValue: client.avg_customer_value,
          targetRoas: client.target_roas,
        });
        if (derived.value == null) continue;

        let history: AdsLogRow[] = [];
        try {
          history = await api.readAdsLog(root, slug, HISTORY_DAYS);
        } catch {
          history = [];
        }
        const verdict = decideAccount({
          account,
          targetCpa: derived.value,
          history: buildHistoryMap(history),
        });
        next.set(slug, verdict);
      }
      setVerdicts(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Recompute + persist a CSV snapshot for every opted-in account. */
  const runNow = async () => {
    if (!root) return;
    setBusy(true);
    setError(null);
    try {
      const next = new Map<string, AccountVerdict>();
      for (const account of accounts) {
        const slug = account.clientSlug;
        if (!slug) continue;
        const client = clientBySlug.get(slug);
        if (!client) continue;
        if ((client.optimizer_mode ?? "off") === "off") continue;
        const derived = deriveTargetCpa({
          targetCpaOverride: client.target_cpa_override,
          avgCustomerValue: client.avg_customer_value,
          targetRoas: client.target_roas,
        });
        if (derived.value == null) continue;

        let history: AdsLogRow[] = [];
        try {
          history = await api.readAdsLog(root, slug, HISTORY_DAYS);
        } catch {
          history = [];
        }
        const verdict = decideAccount({
          account,
          targetCpa: derived.value,
          history: buildHistoryMap(history),
        });
        next.set(slug, verdict);
        const rows = accountToLogRows(account, verdict);
        try {
          await api.writeAdsLogSnapshot(root, slug, rows);
        } catch (e) {
          // Don't fail the whole loop on one client's write — log and continue.
          console.warn(`Optimizer snapshot for ${slug} failed:`, e);
        }
      }
      setVerdicts(next);
      setLastSnapshotAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Recompute verdicts whenever account data changes (no log write).
  useEffect(() => {
    void compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsKey, clientBySlug, root]);

  // 6-hour persistence loop. Fires once on mount and on each tick.
  const ranOnceRef = useRef(false);
  useEffect(() => {
    if (!root || accounts.length === 0) return;
    if (!ranOnceRef.current) {
      ranOnceRef.current = true;
      void runNow();
    }
    const id = window.setInterval(() => {
      void runNow();
    }, SIX_HOURS_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, accountsKey]);

  return { verdicts, lastSnapshotAt, runNow, busy, error };
}
