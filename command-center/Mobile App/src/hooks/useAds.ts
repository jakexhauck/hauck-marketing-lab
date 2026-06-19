import { useMemo } from "react";
import { useClient } from "../context/ClientContext";
import { buildAdsDataset, type AdsDataset, type AdsRange } from "../lib/adsData";

// The Paid Ads surface reads its data through this hook so the components stay
// source-agnostic. Today it returns a deterministic demo dataset (see
// `adsData.ts`); when a real ads source is wired, swap the body for a query and
// keep the return shape: nothing downstream changes.
export function useAdsData(range: AdsRange): AdsDataset {
  const { client } = useClient();
  const appName = client.brand.appName;
  return useMemo(
    () => buildAdsDataset(range, appName, new Date()),
    [range, appName],
  );
}
