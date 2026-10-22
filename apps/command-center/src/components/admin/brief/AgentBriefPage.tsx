import { useEffect, useRef, useState } from "react";
import { emptyPage, type AdsPage as Ads, type BriefPageData, type BriefPageId, type ResearchPage as Research } from "../../../lib/briefPages";
import { freshKeys } from "../../../lib/briefPageOps";
import { useBrief } from "../agents/BriefPanel";
import { AdsPage } from "./AdsPage";
import { MissionStyle } from "./missionStyle";
import { ResearchPage } from "./ResearchPage";

// How long the tint on a just-approved change stays (docs/build-plans/hermes-agent-ops.md, Phase 2).
const FRESH_MS = 4_000;

// The Research or Ads Agent's own Mission Control page, beside its chat. Jake
// approves a brief card in the chat and the change lands here: the approve
// refetches the brief (useItemAction), and whatever is new since the last read
// is tinted for a moment. Same cached query as the Brief page, so the two agree.
export function AgentBriefPage({ tenantId, page }: { tenantId: string; page: BriefPageId }) {
  const { q, sections, pages } = useBrief(tenantId);
  const row = pages.find((p) => p.page === page);
  const data: BriefPageData = row?.data ?? emptyPage(page);
  const version = row?.version ?? 0;

  // The page as last drawn. Only a newer version is compared, so the first
  // load and a refetch of the same version tint nothing.
  const seen = useRef<{ version: number; data: BriefPageData } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>();
  useEffect(() => {
    if (!q.data) return;
    const prev = seen.current;
    seen.current = { version, data };
    if (!prev || version <= prev.version) return;
    const keys = freshKeys(page, prev.data, data);
    if (keys.size) setFresh(keys);
    // Keyed on the version alone: the 15s refetch hands back a new object for
    // the same page, which is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, version, !!q.data]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(undefined), FRESH_MS);
    return () => clearTimeout(t);
  }, [fresh]);

  return (
    <div className="mcb">
      <MissionStyle />
      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isLoadingError ? (
        <div className="mcb-empty">Brief did not load.</div>
      ) : page === "ads" ? (
        <AdsPage tenantId={tenantId} page={data as Ads} sections={sections} fresh={fresh} />
      ) : (
        <ResearchPage tenantId={tenantId} page={data as Research} sections={sections} fresh={fresh} />
      )}
    </div>
  );
}
