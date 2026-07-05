import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Client-side shape for the Paid Ads "Media" tab, mirroring
// functions/api/ads/media.ts. Read-only: the ad account's images and videos.
export interface AdMediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnail: string;
  name: string;
}

export interface AdsMediaResponse {
  configured: boolean;
  items: AdMediaItem[];
  error?: string;
}

// Coerce whatever the endpoint returns into a complete response so a partial or
// error payload can never crash the gallery (mirrors the insights normalizer).
export function normalizeAdsMedia(raw: unknown): AdsMediaResponse {
  if (!raw || typeof raw !== "object") return { configured: false, items: [] };
  const r = raw as Partial<AdsMediaResponse>;
  return {
    configured: Boolean(r.configured),
    items: Array.isArray(r.items) ? r.items : [],
    error: r.error,
  };
}

export function useAdsMedia(enabled: boolean) {
  return useQuery({
    queryKey: ["ads", "media"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api<AdsMediaResponse>("/api/ads/media"),
    select: normalizeAdsMedia,
  });
}
