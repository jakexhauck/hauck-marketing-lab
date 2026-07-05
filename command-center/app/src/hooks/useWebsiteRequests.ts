import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import { timeAgo } from "../lib/timeAgo";
import { SEED_REQUESTS } from "../routes/website/shared";
import type { ChangeRequest, Device } from "../routes/website/shared";

// Data layer for Website > Request a Change. Demo/preview keeps the hand-authored
// pins in local state so the interaction still feels live without a backend; a
// real session reads and writes GET/POST /api/website/requests, the rows that
// Jake's future admin mirror reads (transparent sync). Either way the surface
// gets the same ChangeRequest shape, so the page stays source-agnostic.

// The wire shape returned by the API (see functions/api/website/requests).
interface WebsiteRequestDTO {
  id: string;
  page: string;
  device: "desktop" | "mobile";
  xPct: number;
  yPct: number;
  note: string;
  status: "open" | "in_progress" | "done";
  createdAt: string;
}

export interface NewRequestInput {
  page: string;
  device: Device;
  xPct: number;
  yPct: number;
  note: string;
}

export interface UseWebsiteRequests {
  requests: ChangeRequest[];
  add: (input: NewRequestInput) => Promise<ChangeRequest | null>;
  loading: boolean;
  // The backend cannot persist (Supabase unconfigured / tenant unresolved). The
  // surface stays usable but requests will not survive a reload.
  unavailable: boolean;
}

function fromDto(d: WebsiteRequestDTO, now = Date.now()): ChangeRequest {
  return {
    id: d.id,
    page: d.page || "home",
    device: d.device,
    xPct: d.xPct,
    yPct: d.yPct,
    note: d.note,
    status: d.status,
    ts: timeAgo(d.createdAt, now),
  };
}

export function useWebsiteRequests(): UseWebsiteRequests {
  const demo = demoMode();
  const qc = useQueryClient();

  // Demo pins live here so dropping one is instant and never hits the network.
  const [demoRequests, setDemoRequests] = useState<ChangeRequest[]>(
    () => SEED_REQUESTS,
  );

  const query = useQuery({
    queryKey: ["website", "requests"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () =>
      api<{ requests: WebsiteRequestDTO[]; unavailable?: boolean }>(
        "/api/website/requests",
      ),
  });

  const createMut = useMutation({
    mutationFn: (input: NewRequestInput) =>
      api<{ request: WebsiteRequestDTO }>("/api/website/requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["website", "requests"] }),
  });

  const add = useCallback(
    async (input: NewRequestInput): Promise<ChangeRequest | null> => {
      if (demo) {
        const created: ChangeRequest = {
          id: `req-local-${demoRequests.length + 1}`,
          page: input.page,
          device: input.device,
          xPct: input.xPct,
          yPct: input.yPct,
          note: input.note,
          status: "open",
          ts: "Just now",
        };
        setDemoRequests((prev) => [...prev, created]);
        return created;
      }
      try {
        const { request } = await createMut.mutateAsync(input);
        return fromDto(request);
      } catch {
        return null;
      }
    },
    [demo, demoRequests.length, createMut],
  );

  const requests = demo
    ? demoRequests
    : (query.data?.requests ?? []).map((d) => fromDto(d));

  return {
    requests,
    add,
    loading: !demo && query.isLoading,
    unavailable: !demo && Boolean(query.data?.unavailable),
  };
}
