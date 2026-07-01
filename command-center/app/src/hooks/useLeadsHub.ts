import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { buildLeadsHub, type LeadsHubDataset } from "../lib/leadsHub";

// The merged Leads surface reads its worklist through this hook so the page stays
// source-agnostic. Today it returns a hand-authored demo worklist in demo/preview
// mode and an empty set in a real session (no GoHighLevel feed yet). When the live
// sources land, swap the body for queries against the Paid Ad's + Organic
// pipelines and the conversations API, keeping this return shape.
export function useLeadsHub(): LeadsHubDataset {
  const demo = demoMode();
  return useMemo(() => buildLeadsHub(demo), [demo]);
}
