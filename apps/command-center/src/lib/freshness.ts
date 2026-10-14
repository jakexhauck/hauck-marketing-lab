import { timeAgo } from "./timeAgo";

// "Updated 2m ago" / "Updated just now" for the hero freshness lines. Built from
// react-query's dataUpdatedAt so the time is always real, never fabricated.
// Sub-minute updates collapse into a calmer "just now".
export function freshnessLabel(updatedAt: number, now: number): string {
  if (!updatedAt) return "";
  const rel = timeAgo(new Date(updatedAt).toISOString(), now);
  if (!rel || rel.endsWith("s ago")) return "Updated just now";
  return `Updated ${rel}`;
}
