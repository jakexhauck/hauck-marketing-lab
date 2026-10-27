import { useState, type CSSProperties } from "react";
import { ExternalLink, Replace } from "lucide-react";
import { useMissionControlQuery } from "../../../hooks/useApi";
import { MissionStyle } from "./missionStyle";
import { MissionDocWizard } from "./MissionDocWizard";

// The client's Brief is their Mission Control Google Doc, embedded (Jake,
// 2026-10-26). The doc's own tabs are the pages. The CSM picks it in the wizard
// (MissionDocWizard.tsx), or it is found by name in the client's Drive folder
// (functions/lib/missionControl.ts), so a copy a Grok Bot makes shows up too.
export function MissionBrief({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const q = useMissionControlQuery(tenantId);
  const [changing, setChanging] = useState(false);
  const doc = q.data?.doc ?? null;
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="mcb" style={style}>
      <MissionStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Brief</h2>
        <span className="mcb-grow" />
        {doc && !changing && (
          <>
            <button type="button" className="mcb-btn" aria-label="Change doc" title="Change doc" onClick={() => setChanging(true)}>
              <Replace size={14} />
            </button>
            <a className="mcb-btn" href={doc.url} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Docs" title="Open in Google Docs">
              <ExternalLink size={14} />
            </a>
          </>
        )}
      </div>

      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isError ? (
        <div className="mcb-empty">Brief did not load.</div>
      ) : doc && !changing ? (
        <iframe key={doc.id} title="Mission Control" src={doc.url} className="mcb-doc" />
      ) : (
        <MissionDocWizard tenantId={tenantId} onDone={changing ? () => setChanging(false) : undefined} />
      )}
    </div>
  );
}
