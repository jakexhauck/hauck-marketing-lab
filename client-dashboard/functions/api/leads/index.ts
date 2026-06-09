import type { Env, ApiData } from "../../lib/env";
import { ghlJson, shapeOpportunity, type GhlOpportunity } from "../../lib/ghl";

interface SearchResponse {
  opportunities: GhlOpportunity[];
  meta?: {
    total?: number;
    startAfterId?: string;
    startAfter?: string;
    nextPageUrl?: string;
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const url = new URL(ctx.request.url);
  const pipelineId = url.searchParams.get("pipelineId");

  const base = `/opportunities/search?location_id=${encodeURIComponent(t.ghl_location_id)}&limit=100${
    pipelineId ? `&pipeline_id=${encodeURIComponent(pipelineId)}` : ""
  }`;

  const all: GhlOpportunity[] = [];
  const seen = new Set<string>();
  // Cursor state. GHL opportunities-search may return either a full nextPageUrl
  // (like contacts) or startAfterId / startAfter cursor fields. Handle both.
  let nextPageUrl: string | undefined;
  let startAfterId: string | undefined;
  let startAfter: string | undefined;
  let pageCount = 0;
  const maxPages = 10;

  while (pageCount < maxPages) {
    let path: string;
    if (nextPageUrl) {
      // Prefer the API-provided next-page URL when present.
      path = nextPageUrl;
    } else {
      path = base;
      if (startAfterId)
        path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
      if (startAfter) path += `&startAfter=${encodeURIComponent(startAfter)}`;
    }

    const data = await ghlJson<SearchResponse>(
      { token: t.ghl_token, locationId: t.ghl_location_id },
      path,
    );

    const page = data.opportunities ?? [];
    for (const o of page) {
      if (o.id && !seen.has(o.id)) {
        seen.add(o.id);
        all.push(o);
      }
    }

    // Stop on the natural last page (short page) regardless of cursor style.
    if (page.length < 100) break;

    const next = data.meta?.nextPageUrl;
    const nextId = data.meta?.startAfterId;
    const nextTs = data.meta?.startAfter;

    if (next) {
      // nextPageUrl style: stop if it does not advance.
      if (next === nextPageUrl) break;
      nextPageUrl = next;
    } else {
      // startAfterId / startAfter style: stop if the cursor is absent or
      // did not advance.
      if (!nextId || nextId === startAfterId) break;
      startAfterId = nextId;
      startAfter = nextTs;
    }

    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `leads pagination hit maxPages cap for location ${t.ghl_location_id}`,
    );
  }

  const leads = all.map(shapeOpportunity);
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ leads, total: leads.length });
};
