import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { type Job } from "../lib/jobsPipeline";

interface JobsResponse {
  jobs: Job[];
  // Present when the Sales pipeline / job stages could not be resolved for the
  // tenant; the page just shows an empty calendar in that case.
  configError?: string;
}

// The Jobs (Sales) surface reads its work through this hook so the page stays
// source-agnostic. It fetches the Sales Pipeline jobs (Job Booked + Job
// Completed, joined to each appointment for date/time) from /api/sales/jobs. In
// a demo session api() short-circuits to the hand-authored DEMO_JOBS schedule,
// so the return shape is identical either way and nothing downstream changes.
export function useJobs(): Job[] {
  const { data } = useQuery({
    queryKey: ["sales-jobs"],
    queryFn: () => api<JobsResponse>("/api/sales/jobs"),
  });
  return data?.jobs ?? [];
}
