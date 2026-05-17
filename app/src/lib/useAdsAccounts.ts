// useAdsAccounts — load Meta Ads insights for the dashboard.
//
// For each client with `meta_ad_account_id` set, fires the Tauri command
// `meta_list_ads_insights` (which is disk-cached in Rust for 15min, then
// hits graph.facebook.com). Clients without a connected account fall back
// to the deterministic mock generator so the UI never empties out.
//
// Per-client `meta_conversion_action` is threaded into the call so each
// client's "Results" tally reflects what they actually optimize for.

import { useCallback, useEffect, useState } from "react";
import { api } from "./tauri";
import type { ClientEntry } from "./types";
import { getMockAdsAccount, type MetaAdsAccount } from "./mockMetaAds";

export interface AdsRangeOptions {
  /** Day-count fallback when startDate/endDate aren't set. */
  windowDays: number;
  /** YYYY-MM-DD. When both startDate and endDate are set, overrides windowDays. */
  startDate?: string | null;
  endDate?: string | null;
  /** Meta attribution windows, e.g. ["7d_click","1d_view"]. */
  attributionWindows?: string[] | null;
}

export interface UseAdsAccountsState {
  accounts: MetaAdsAccount[];
  loading: boolean;
  /** Per-client errors keyed by slug. Empty when everything succeeded. */
  errors: Record<string, string>;
  refresh: () => void;
}

async function loadOne(
  client: ClientEntry,
  range: AdsRangeOptions,
  forceRefresh: boolean,
  root: string | null,
): Promise<{ account: MetaAdsAccount; error: string | null }> {
  if (!client.meta_ad_account_id) {
    return {
      account: getMockAdsAccount(client.slug, client.name, range.windowDays),
      error: null,
    };
  }
  try {
    const account = await api.metaListAdsInsights({
      adAccountId: client.meta_ad_account_id,
      clientSlug: client.slug,
      clientName: client.name,
      windowDays: range.windowDays,
      forceRefresh,
      startDate: range.startDate ?? null,
      endDate: range.endDate ?? null,
      attributionWindows: range.attributionWindows ?? null,
      conversionAction: client.meta_conversion_action ?? null,
      root,
    });
    return { account, error: null };
  } catch (e) {
    return {
      account: getMockAdsAccount(client.slug, client.name, range.windowDays),
      error: String(e),
    };
  }
}

export function useAdsAccounts(
  clients: ClientEntry[],
  range: AdsRangeOptions,
): UseAdsAccountsState {
  const [accounts, setAccounts] = useState<MetaAdsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [root, setRoot] = useState<string | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Stringify the range so React's effect identity doesn't change when the
  // caller passes a fresh object literal with the same values each render.
  const rangeKey = JSON.stringify(range);

  // Resolve media_buying_path once so the Rust side can write KPI snapshots.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.loadConfig();
        if (!cancelled) {
          setRoot(cfg.media_buying_path ?? null);
        }
      } catch {
        if (!cancelled) setRoot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const results = await Promise.all(
        clients.map((c) => loadOne(c, range, tick > 0, root)),
      );
      if (cancelled) return;
      const nextErrors: Record<string, string> = {};
      const nextAccounts: MetaAdsAccount[] = [];
      results.forEach((r, i) => {
        nextAccounts.push(r.account);
        if (r.error) nextErrors[clients[i].slug] = r.error;
      });
      setAccounts(nextAccounts);
      setErrors(nextErrors);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, rangeKey, tick, root]);

  return { accounts, loading, errors, refresh };
}
