import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AccountsData, PostsResponse, SocialPlatform } from "../lib/social";

// Social Planner hooks. Each is demo-aware for free: api() short-circuits to the
// demo handler when demoMode() is on, so the return shapes are identical either
// way. Reads pass `enabled` so the route files can leave them off in a demo tab
// (the route renders its own demo constants there).

export function useSocialAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["social", "accounts"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api<AccountsData>("/api/social/accounts"),
  });
}

export interface PostsQuery {
  status?: "scheduled" | "draft" | "posted" | "failed";
  from?: string; // ISO
  to?: string; // ISO
}

function postsPath(q: PostsQuery): string {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const qs = params.toString();
  return `/api/social/posts${qs ? `?${qs}` : ""}`;
}

export function useSocialPosts(q: PostsQuery, enabled: boolean) {
  return useQuery({
    queryKey: ["social", "posts", q.status ?? null, q.from ?? null, q.to ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<PostsResponse>(postsPath(q)),
  });
}

export interface CreatePostInput {
  platforms: SocialPlatform[];
  summary: string;
  status: "draft" | "scheduled";
  scheduleAt?: string; // ISO, required when status === "scheduled"
}

// Create a draft or scheduled post, then invalidate every posts + accounts query
// so Overview, My Posts, and the Calendar all refetch. Terminal write: no retry.
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) =>
      api<{ post: unknown }>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social", "posts"] });
      qc.invalidateQueries({ queryKey: ["social", "accounts"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string }) =>
      api<{ ok: boolean }>(`/api/social/posts/${encodeURIComponent(input.id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social", "posts"] });
    },
  });
}
