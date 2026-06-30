import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { DEMO_JOBS, type Job } from "../lib/jobsPipeline";

// The Jobs (Sales) surface reads its work through this hook so the page stays
// source-agnostic. Today it returns a hand-authored demo schedule in demo/preview
// mode and an empty set in a real session (no GoHighLevel feed yet). When the
// live source lands, swap the body for a query against the Sales Pipeline at the
// Job Booked + Job Completed stages (joined to each appointment for date/time +
// value) and keep the return shape: nothing downstream changes.
export function useJobs(): Job[] {
  const demo = demoMode();
  return useMemo(() => (demo ? DEMO_JOBS : []), [demo]);
}
