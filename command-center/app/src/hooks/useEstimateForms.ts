import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import { buildEstimateForms, ESTIMATE_LEADS } from "../lib/estimateForms";
import type { InboxDataset } from "../lib/leadInbox";

// The Estimate Forms surface reads its data through this hook so the page stays
// source-agnostic. Demo/preview returns the hand-authored inbox instantly; a
// real session fetches the live Organic-pipeline submissions (source =
// "Website Form") from GET /api/forms/submissions?source=website-form.
export function useEstimateForms(): InboxDataset {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["forms", "website-form"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () =>
      api<{ submissions: unknown[] }>("/api/forms/submissions?source=website-form"),
  });
  const raw = demo ? ESTIMATE_LEADS : data?.submissions;
  return useMemo(() => buildEstimateForms(demo, raw), [demo, raw]);
}
