import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Resolves a single ad video's playable source on demand (only when the Your Ads
// lightbox opens a video). Returns { source, permalink }: source "" means the
// player falls back to the poster plus a "Watch on Facebook" link. Mirrors the
// /api/ads/video/:videoId endpoint shape.
export interface AdVideoSource {
  source: string;
  permalink: string;
}

export function useAdVideoSource(videoId?: string) {
  return useQuery({
    queryKey: ["ads", "video", videoId],
    enabled: Boolean(videoId),
    staleTime: 5 * 60_000,
    queryFn: () => api<AdVideoSource>(`/api/ads/video/${videoId}`),
  });
}
