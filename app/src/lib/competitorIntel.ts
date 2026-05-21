/**
 * Aggregated reader for the client's saved competitor research briefs.
 *
 * The vision: competitor intel is the BASELINE that flows into every
 * downstream form. Jake runs multiple competitor passes across different
 * regions/angles to find recurring patterns. We pull ALL of them and feed
 * the combined digest into Audience Research, Hooks, Creative Brief, Ad Copy,
 * and the Advisor.
 *
 * Competitor research saves under the "scale_checks" generator kind, which
 * is shared with the Audience Builder. We disambiguate by title (the
 * Competitor Research form's defaultTitle starts with "Competitor") and
 * prefer each brief's JSON `key_takeaways` field as the per-brief digest.
 *
 * Returns null when no competitor research has been saved yet. Callers
 * should degrade gracefully — this is additive context, never load-bearing.
 */

import { api } from "./tauri";
import type { GeneratorOutput } from "./types";

function extractJsonFromBody(body: string): Record<string, unknown> | null {
  const start = body.indexOf("```json");
  if (start === -1) return null;
  const after = body.slice(start + "```json".length).replace(/^\n/, "");
  const end = after.indexOf("```");
  if (end === -1) return null;
  try {
    return JSON.parse(after.slice(0, end).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract the single most useful chunk from one brief: prefer JSON
 *  `key_takeaways`, fall back to `summary`, last resort the body excerpt. */
function digestOne(brief: GeneratorOutput): string | null {
  const parsed = extractJsonFromBody(brief.body);
  if (parsed) {
    if (typeof parsed.key_takeaways === "string") {
      const t = parsed.key_takeaways.trim();
      if (t.length > 0) return t;
    }
    if (typeof parsed.white_space === "string") {
      const t = parsed.white_space.trim();
      if (t.length > 0) return t;
    }
  }
  if (brief.summary && brief.summary.trim().length > 0) {
    return brief.summary.trim();
  }
  const body = brief.body.trim();
  if (body.length === 0) return null;
  return body.length > 1200 ? body.slice(0, 1200) + "\n…[truncated]" : body;
}

/** Read every saved competitor brief for the client and combine them into
 *  one digest with per-brief headers. Synthesis (finding cross-brief
 *  patterns) happens at consumption time inside whichever form/advisor
 *  reads this. Returns null when nothing's saved. */
export async function readAggregatedCompetitorIntel(
  root: string,
  clientSlug: string,
): Promise<string | null> {
  try {
    const outputs = await api.listGeneratorOutputs(root, clientSlug, "scale_checks", 20);
    const briefs = outputs.filter((o) =>
      (o.title ?? "").toLowerCase().includes("competitor"),
    );
    if (briefs.length === 0) return null;

    const blocks: string[] = [];
    for (const brief of briefs) {
      const digest = digestOne(brief);
      if (!digest) continue;
      const header = brief.title?.trim().length
        ? brief.title.trim()
        : `Competitor brief · ${brief.created_at?.slice(0, 10) ?? "unknown"}`;
      blocks.push(`### ${header}\n\n${digest}`);
    }
    if (blocks.length === 0) return null;

    const intro =
      briefs.length > 1
        ? `${briefs.length} competitor briefs saved for this client. Synthesize across them: lean on angles, offers, and white-space gaps that appear in MULTIPLE briefs — that's the signal. Per-brief detail follows.\n\n`
        : "";
    return intro + blocks.join("\n\n---\n\n");
  } catch {
    return null;
  }
}
