import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { useCreateMissionControl, useMissionControlQuery } from "../../../hooks/useApi";
import { MissionStyle } from "./missionStyle";

// The client's Brief is their Mission Control Google Doc, embedded (Jake,
// 2026-10-26). The doc's own tabs are the pages. It is a copy of the Mission
// Control template in the client's Drive folder (functions/lib/missionControl.ts),
// made here or by a Grok Bot.
export function MissionBrief({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const q = useMissionControlQuery(tenantId);
  const create = useCreateMissionControl(tenantId);
  const doc = q.data?.doc ?? null;
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="mcb" style={style}>
      <MissionStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Brief</h2>
        <span className="mcb-grow" />
        {doc && (
          <a className="mcb-btn" href={doc.url} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Docs" title="Open in Google Docs">
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isError ? (
        <div className="mcb-empty">Brief did not load.</div>
      ) : doc ? (
        <iframe key={doc.id} title="Mission Control" src={doc.url} className="mcb-doc" />
      ) : !q.data?.hasFolder ? (
        <div className="mcb-empty">No Drive folder.</div>
      ) : (
        <div>
          <button type="button" className="mcb-btn" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating..." : "Create Mission Control"}
          </button>
          {create.isError && <div className="mcb-empty">{(create.error as Error).message}</div>}
        </div>
      )}
    </div>
  );
}
